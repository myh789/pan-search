/**
 * 零依赖探针：确认 Cloud Functions 是否生效
 * GET /api/ping 必须返回 JSON；若仍是首页，说明上传包根目录缺少 cloud-functions
 */
function payload(context) {
  return {
    code: 200,
    message: 'cloud-functions ok',
    data: {
      ok: true,
      runtime: 'cloud',
      path: '/api/ping',
      region: context?.server?.region || null,
      requestId: context?.server?.requestId || context?.uuid || null,
      hasEnv: !!(context?.env && Object.keys(context.env || {}).length),
      ts: Date.now(),
    },
  };
}

function respond(context) {
  return new Response(JSON.stringify(payload(context), null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
  });
}

export default async function onRequest(context) {
  return respond(context);
}

export async function onRequestGet(context) {
  return respond(context);
}
