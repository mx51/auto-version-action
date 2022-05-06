import * as core from '@actions/core'
import * as github from '@actions/github'
import {wait} from './wait'
import { join } from 'path';

/**
 * Retrieves the package version from the package.json file
 */
function getVersion(){
  try {
    // const packageJsonPath = join('./package.json')
    const jsonData: any = require('./package.json')
    console.log(jsonData)
    console.log(jsonData.version)
    
  } catch (error) {
    throw new Error("File does not exist")
  }

}

async function run(): Promise<void> {
  try {
    console.log("HELLo WORLD")
    console.log("Current directory:", __dirname);
    getVersion()
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
