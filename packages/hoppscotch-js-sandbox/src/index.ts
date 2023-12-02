import {
  TestResult,
  TestDescriptor as _TestDescriptor,
  TestResponse as _TestResponse,
} from "./types"

import { execPreRequestScriptForNode } from "./pre-request/node-vm"
import { execPreRequestScriptForWeb } from "./pre-request/web-worker"
import { execTestScriptForNode } from "./test-runner/node-vm"
import { execTestScriptForWeb } from "./test-runner/web-worker"

export type TestResponse = _TestResponse
export type TestDescriptor = _TestDescriptor
export type SandboxTestResult = TestResult & { tests: TestDescriptor }

/**
 * Executes a given test script on the test-runner sandbox
 * @param testScript The string of the script to run
 * @returns A TaskEither with an error message or a TestDescriptor with the final status
 */
export const runTestScriptForWeb = execTestScriptForWeb

export const runPreRequestScriptForWeb = execPreRequestScriptForWeb
/**
 * Executes a given pre-request script on the sandbox
 * @param preRequestScript The script to run
 * @param env The environment variables active
 * @returns A TaskEither with an error message or an array of the final environments with the all the script values applied
 */
export const runPreRequestScriptForNode = execPreRequestScriptForNode

export const runTestScriptForNode = execTestScriptForNode
