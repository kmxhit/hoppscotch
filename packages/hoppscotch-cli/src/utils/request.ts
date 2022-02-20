import axios, { Method } from "axios";
import chalk from "chalk";
import { WritableStream } from "table";
import * as S from "fp-ts/string";
import * as E from "fp-ts/Either";
import * as A from "fp-ts/Array";
import * as T from "fp-ts/Task";
import * as TE from "fp-ts/TaskEither";
import { pipe } from "fp-ts/function";
import { HoppRESTRequest, HoppCollection, Environment } from "@hoppscotch/data";
import { runPreRequestScript } from "@hoppscotch/js-sandbox";
import {
  debugging,
  GRequest,
  responseErrors,
  getEffectiveRESTRequest,
  getTableResponse,
  getTableStream,
  getTestResponse,
} from ".";
import {
  RequestStack,
  RequestConfig,
  RunnerResponseInfo,
  EffectiveHoppRESTRequest,
  TestScriptData,
} from "../interfaces";
import { error, HoppCLIError } from "../types";
import { handleError } from "../handlers";
// !NOTE: The `config.supported` checks are temporary until OAuth2 and Multipart Forms are supported

/**
 * Takes in a Hoppscotch REST Request, and converts each request to an Axios object
 * @param rootPath The file path
 * @param req Hoppscotch REST Request
 * @returns A stack element of the request stack
 */
const createRequest = (
  rootPath: string,
  req: EffectiveHoppRESTRequest,
  debug: boolean
): RequestStack => {
  const config: RequestConfig = {
    supported: true,
  };
  const reqParams = A.isNonEmpty(req.effectiveFinalParams)
    ? req.effectiveFinalParams
    : req.params;
  const reqHeaders = A.isNonEmpty(req.effectiveFinalHeaders)
    ? req.effectiveFinalHeaders
    : req.headers;
  config.url = S.isEmpty(req.effectiveFinalURL)
    ? req.endpoint
    : req.effectiveFinalURL;
  config.method = req.method as Method;
  if (debug === true) {
    config.transformResponse = [
      (data: any) => {
        let parsedData = data;
        try {
          parsedData = JSON.parse(data);
        } catch (error) {
          parsedData = data;
        }
        debugging.info(`REQUEST_NAME: ${req.name}`);
        debugging.dir(parsedData);
        return parsedData;
      },
    ];
  }
  for (const x of reqParams) {
    if (x.active) {
      if (!config.params) {
        config.params = {};
      }
      if (x.key) config.params[x.key] = x.value;
    }
  }
  for (const x of reqHeaders) {
    if (x.active) {
      if (!config.headers) {
        config.headers = {};
      }
      if (x.key) config.headers[x.key] = x.value;
    }
  }
  if (req.auth.authActive) {
    switch (req.auth.authType) {
      case "bearer": {
        if (!config.headers) {
          config.headers = {};
        }
        config.headers["Authorization"] = `Bearer ${req.auth.token}`;
        break;
      }
      case "basic": {
        config.auth = {
          username: req.auth.username,
          password: req.auth.password,
        };
        break;
      }
      case "oauth-2": {
        // TODO: OAuth2 Request Parsing
        // !NOTE: Temporary `config.supported` check
        config.supported = false;
      }
      default: {
        break;
      }
    }
  }
  if (req.body.contentType) {
    if (!config.headers) {
      config.headers = {};
    }
    config.headers["Content-Type"] = req.body.contentType;
    switch (req.body.contentType) {
      case "multipart/form-data": {
        // TODO: Parse Multipart Form Data
        // !NOTE: Temporary `config.supported` check
        config.supported = false;
        break;
      }
      default: {
        config.data =
          req.effectiveFinalBody !== null
            ? req.effectiveFinalBody
            : req.body.body;
        break;
      }
    }
  }
  return {
    path: `${rootPath}/${req.name.length > 0 ? req.name : "Untitled Request"}`,
    request: () => axios(config),
    name: req.name,
    testScript: req.testScript,
  };
};

/**
 * The request runner to execute the request stack
 * @param x The request stack
 * @returns The response table row
 */
export const requestRunner =
  (x: RequestStack): T.Task<RunnerResponseInfo> =>
  async () => {
    try {
      let status: number;
      const baseResponse = await x.request();
      const { config } = baseResponse;
      const runnerResponse: RunnerResponseInfo = {
        ...baseResponse,
        path: x.path,
        endpoint: GRequest.endpoint(config.url),
        method: GRequest.method(config.method),
        body: baseResponse.data,
      };

      // !NOTE: Temporary `config.supported` check
      if ((config as RequestConfig).supported === false) {
        status = 501;
        runnerResponse.status = status;
        runnerResponse.statusText = responseErrors[status];
      }

      return runnerResponse;
    } catch (err) {
      let status: number;
      let statusText: string;
      const runnerResponse: RunnerResponseInfo = {
        path: x.path,
        endpoint: "",
        method: "GET",
        body: {},
        statusText: "",
        status: 0,
        headers: [],
      };

      if (axios.isAxiosError(err)) {
        runnerResponse.method = GRequest.method(err.config.method);
        runnerResponse.endpoint = GRequest.endpoint(err.config.url);

        // !NOTE: Temporary `config.supported` check
        if ((err.config as RequestConfig).supported === false) {
          status = 501;
          statusText = responseErrors[status];
        } else if (!err.response) {
          status = 408;
          statusText = responseErrors[status];
        } else {
          status = err.response.status;
          statusText = err.response.statusText;
        }
      } else {
        status = 600;
        statusText = responseErrors[status];
      }
      runnerResponse.status = status;
      runnerResponse.statusText = statusText;

      return runnerResponse;
    }
  };

/**
 * The request parser from the collection JSON
 * @param x The collection object parsed from the JSON
 * @param requests Array of requests
 * @param debug Boolean to use debugging session
 * @param rootPath The folder path
 */
export const requestsParser =
  (
    x: HoppCollection<HoppRESTRequest>,
    requests: RequestStack[],
    debug: boolean,
    rootPath: string = "$ROOT"
  ): T.Task<void> =>
  async () => {
    for (const request of x.requests) {
      let effectiveReq: EffectiveHoppRESTRequest = {
        ...request,
        effectiveFinalBody: null,
        effectiveFinalHeaders: [],
        effectiveFinalParams: [],
        effectiveFinalURL: S.empty,
      };

      const _preRequestScriptRunner = await preRequestScriptRunner(
        effectiveReq
      )();

      if (E.isRight(_preRequestScriptRunner)) {
        effectiveReq = _preRequestScriptRunner.right;
      } else {
        return handleError(_preRequestScriptRunner.left);
      }

      const createdReq: RequestStack = createRequest(
        `${rootPath}/${x.name}`,
        effectiveReq,
        debug
      );
      requests.push(createdReq);
    }

    for (const folder of x.folders) {
      await requestsParser(folder, requests, debug, `${rootPath}/${x.name}`)();
    }
  };

const preRequestScriptRunner =
  (
    request: EffectiveHoppRESTRequest
  ): TE.TaskEither<HoppCLIError, EffectiveHoppRESTRequest> =>
  async () => {
    if (!S.isEmpty(request.preRequestScript)) {
      const preRequestScriptRes = await runPreRequestScript(
        request.preRequestScript,
        []
      )();

      if (E.isRight(preRequestScriptRes)) {
        const envs: Environment = {
          name: "Env",
          variables: preRequestScriptRes.right,
        };
        return getEffectiveRESTRequest(request, envs);
      }

      return E.left(
        error({
          code: "PRE_REQUEST_SCRIPT_ERROR",
          data: preRequestScriptRes.left,
        })
      );
    }
    return E.right(request);
  };

export const runRequests = (
  requests: RequestStack[]
): TE.TaskEither<HoppCLIError, TestScriptData[]> =>
  pipe(
    TE.tryCatch(
      async () => {
        const testScriptData: TestScriptData[] = [];
        if (A.isNonEmpty(requests)) {
          const tableStream = getTableStream();
          const requestsPromise = [];
          responseTableOutput.header(tableStream);

          for (const request of requests) {
            requestsPromise.push(
              pipe(
                request,
                requestRunner,
                T.map((res) => {
                  responseTableOutput.body(res, tableStream);
                  return {
                    name: request.name,
                    testScript: request.testScript,
                    response: res,
                  };
                })
              )()
            );
          }

          const responses = await Promise.all(requestsPromise);
          for (const response of responses) {
            const testResponse = getTestResponse(response.response);
            const testScriptPair: TestScriptData = {
              name: response.name,
              testScript: response.testScript,
              response: testResponse,
            };
            testScriptData.push(testScriptPair);
          }
          process.stdout.write("\n");
        }
        return testScriptData;
      },
      (reason) => error({ code: "UNKNOWN_ERROR", data: E.toError(reason) })
    )
  );

const responseTableOutput = {
  header: (tableStream: WritableStream) => {
    console.clear();
    tableStream.write([
      pipe("PATH", chalk.cyanBright, chalk.bold),
      pipe("METHOD", chalk.cyanBright, chalk.bold),
      pipe("ENDPOINT", chalk.cyanBright, chalk.bold),
      pipe("STATUS CODE", chalk.cyanBright, chalk.bold),
    ]);
  },
  body: (response: RunnerResponseInfo, tableStream: WritableStream) => {
    const tableResponse = getTableResponse(response);
    tableStream.write([
      tableResponse.path,
      tableResponse.method,
      tableResponse.endpoint,
      tableResponse.statusCode,
    ]);
  },
};
