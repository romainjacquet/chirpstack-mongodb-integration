/*
* main entry point
*/

import application from "./application.mjs"



await application.initialize()
await application.run()
await application.finalize()