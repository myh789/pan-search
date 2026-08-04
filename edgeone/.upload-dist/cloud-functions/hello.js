/**
 * 根级探针：/hello （不经过 /api）
 * 若 /hello 是 JSON 而 /api/ping 是首页，说明 api 前缀被静态抢占。
 */
export default function onRequest() {
  return new Response(
    JSON.stringify({ code: 200, message: 'hello ok', path: '/hello', ts: Date.now() }, null, 2),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    }
  );
}

export function onRequestGet() {
  return onRequest();
}
