import { createDatabaseClient, createSiteContext, errorResponse } from './_qoder/backend.mjs';
import { callLlm } from './core.mjs';
import { application } from './routes.mjs';

const handle = application({ db: createDatabaseClient(), llm: callLlm });
Deno.serve(async request => {
  let context;
  try { context = createSiteContext(request); return await handle(context); }
  catch (error) { return errorResponse(error, context?.requestId); }
});
