import { Hono } from 'hono';
import type { Env } from '../env';
import { getConf } from '../services/conf';
import { jok, jerr } from '@pan-search/shared';
import { httpJson, nowSec } from '../utils';

export const wechatRoutes = new Hono<{ Bindings: Env }>();

/** Official account callback — echo / text search */
wechatRoutes.all('/serve', async (c) => {
  const conf = await getConf(c.env);
  const token = conf.wechat_token || '';
  const echostr = c.req.query('echostr');
  if (echostr) {
    // signature check simplified: require token configured
    if (!token) return c.text('token not configured', 500);
    return c.text(echostr);
  }
  const xml = await c.req.text();
  const msg = xml.match(/<Content><!\[CDATA\[([\s\S]*?)\]\]><\/Content>/)?.[1] || '';
  const from = xml.match(/<FromUserName><!\[CDATA\[([\s\S]*?)\]\]><\/FromUserName>/)?.[1] || '';
  const to = xml.match(/<ToUserName><!\[CDATA\[([\s\S]*?)\]\]><\/ToUserName>/)?.[1] || '';
  let reply = '请发送要搜索的资源名称';
  if (msg) {
    const { getSourceList } = await import('../services/source');
    const list = await getSourceList(c.env, conf, { title: msg, page_size: 5 });
    if (list.items.length) {
      reply = list.items.map((i: any, idx: number) => `${idx + 1}. ${i.title}\n${i.url}`).join('\n\n');
    } else {
      reply = '本地未找到，可到网站使用全网搜';
    }
  }
  const out = `<xml><ToUserName><![CDATA[${from}]]></ToUserName><FromUserName><![CDATA[${to}]]></FromUserName><CreateTime>${nowSec()}</CreateTime><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[${reply}]]></Content></xml>`;
  return c.text(out, 200, { 'Content-Type': 'application/xml' });
});

/** WeChat chatbot open API */
wechatRoutes.post('/chatbot', async (c) => {
  const conf = await getConf(c.env);
  const body = await c.req.json().catch(() => ({} as any));
  const encrypted = body.encrypted || c.req.query('encrypted');
  if (!encrypted) return c.json(jerr('empty'));
  const lock = await c.env.KV.get(`chatbot:${encrypted}`);
  if (lock) return c.json(jok('dup'));
  await c.env.KV.put(`chatbot:${encrypted}`, '1', { expirationTtl: 600 });

  const message = body.msg || body.content || '';
  const name = conf.chatbot_name || 'PanSearch';
  let reply = `${name}：请发送资源关键词`;
  if (message) {
    const { getSourceList } = await import('../services/source');
    const list = await getSourceList(c.env, conf, { title: message, page_size: 3, is_time: 1 });
    if (list.items.length) {
      reply = list.items.map((i: any) => `${i.title}\n${i.url}`).join('\n\n');
    } else {
      reply = `${name}：暂未找到「${message}」`;
    }
  }

  // If chatbot credentials exist, push via openapi
  if (conf.chatbot_token && conf.chatbot_app_id) {
    try {
      await httpJson('https://chatbot.weixin.qq.com/openapi/sendmsg/' + conf.chatbot_token, {
        method: 'POST',
        body: { msg: reply },
      });
    } catch {
      /* ignore */
    }
  }
  return c.json(jok('ok', { reply }));
});

/** Baidu SMS stub — credentials via secrets/conf */
wechatRoutes.post('/sms/send', async (c) => {
  return c.json(jerr('请在 conf 配置百度短信后启用；当前为占位接口'));
});
