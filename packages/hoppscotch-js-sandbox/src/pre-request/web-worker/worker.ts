import * as TE from "fp-ts/TaskEither"
import { cloneDeep } from "lodash-es"

import { TestResult } from "~/types"
import { getPreRequestScriptMethods } from "~/utils"

const executeScriptInContext = (
  preRequestScript: string,
  envs: TestResult["envs"]
): TE.TaskEither<string, TestResult["envs"]> => {
  try {
    const { pw, updatedEnvs } = getPreRequestScriptMethods(cloneDeep(envs))

    // Create a function from the pre request script using the `Function` constructor
    const executeScript = new Function("pw", preRequestScript)

    // Execute the script
    executeScript(pw, cloneDeep, updatedEnvs)

    return TE.right(updatedEnvs)
  } catch (error) {
    return TE.left(`Script execution failed: ${(error as Error).message}`)
  }
}

// Listen for messages from the main thread
self.addEventListener("message", async (event) => {
  const { preRequestScript, envs } = event.data

  const results = await executeScriptInContext(preRequestScript, envs)()

  // Post the result back to the main thread
  self.postMessage({ results })
})
