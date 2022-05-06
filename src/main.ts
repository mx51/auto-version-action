import * as core from '@actions/core'
import * as github from '@actions/github'
import {wait} from './wait'
import { join } from 'path';

/**
 * Retrieves the package version from the package.json file
 */
function getVersion(projectDir: string){
  try {
    const packageJsonPath = join(projectDir,'package.json')
    const jsonData: any = require(packageJsonPath)
    console.log(jsonData)
    console.log(jsonData.version)
    
  } catch (error) {
    throw new Error("File does not exist")
  }

}

async function run(): Promise<void> {
  try {
    const projectDir = core.getInput('projectDir')
    console.log("HELLo WORLD")
    console.log("Current directory:", __dirname);
    getVersion(projectDir)
    // const ms: string = core.getInput('milliseconds')
    // core.debug(`Waiting ${ms} milliseconds ...`) // debug is only output if you set the secret `ACTIONS_STEP_DEBUG` to true

    // core.debug(new Date().toTimeString())
    // await wait(parseInt(ms, 10))
    // core.debug(new Date().toTimeString())

    // core.setOutput('time', new Date().toTimeString())
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
