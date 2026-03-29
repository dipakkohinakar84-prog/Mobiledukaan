import { getSyncRuntimeConfig, json } from './_shared.mjs'

export const handler = async () => json(200, getSyncRuntimeConfig())
