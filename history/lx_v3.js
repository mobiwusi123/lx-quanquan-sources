/*!
 * @name 圈圈音源
 * @description 五平台取播放链接 v3
 * @version 3
 * @author 圈圈
 */
;(function(){
  var lx = globalThis.lx;
  var EV = lx.EVENT_NAMES;
  var API = 'https://api.music.lerd.dpdns.org';

  function dig(obj, path){
    var cur = obj;
    for (var i = 0; i < path.length; i++){
      if (cur === null || cur === undefined) return undefined;
      cur = cur[path[i]];
    }
    return cur;
  }

  function parseBody(resp){
    var b = resp && resp.body;
    if (typeof b === 'string'){
      try { b = JSON.parse(b); } catch (e) {}
    }
    return b;
  }

  function http(url, opts){
    return new Promise(function(resolve, reject){
      lx.request(url, opts || { method: 'GET' }, function(err, resp){
        if (err) return reject(new Error('net:' + String(err).slice(0, 120)));
        if (!resp) return reject(new Error('empty resp'));
        if (resp.statusCode && (resp.statusCode < 200 || resp.statusCode >= 400)){
          return reject(new Error('http ' + resp.statusCode));
        }
        resolve(resp);
      });
    });
  }

  // 依次尝试多种解析方式：响应对象里的 body
  function getJSON(resp){
    var b = parseBody(resp);
    if (b && typeof b === 'object') return b;
    // 少数情况下 body 就是顶层
    if (resp && typeof resp === 'object' && resp.code !== undefined) return resp;
    throw new Error('bad body');
  }

  http(API + '/init.conf', { method: 'GET' }).then(function(resp){
    var b = getJSON(resp);
    if (!b || b.code !== 200) throw new Error('init.conf code=' + (b && b.code));
    lx.send(EV.inited, b.data.init);
  }).catch(function(e){
    throw new Error('init:' + (e && e.message ? e.message : String(e)));
  });

  lx.on(EV.request, function(payload){
    var action = payload.action;
    var source = payload.source;
    var info = payload.info;
    if (action !== 'musicUrl') throw new Error('bad action ' + action);

    return http(API + '/' + source, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(info)
    }).then(function(resp){
      var b = getJSON(resp);

      // 直接拿到链接
      if (b.code === 200 && b.data && b.data.url) return b.data.url;

      // 303：服务器给了二次请求指令
      if (b.code === 303 && b.data && b.data.request){
        var req = b.data.request;
        var spec = b.data.response || {};
        var reqOpts = req.options || { method: 'GET' };
        return http(req.url, reqOpts).then(function(resp2){
          var b2 = getJSON(resp2);
          // check.key 的路径是相对于「整个响应对象」的，即 resp2.body.code
          if (spec.check && spec.check.key){
            var got = dig(resp2, spec.check.key);
            if (got === undefined) got = dig(b2, spec.check.key.slice(1));
            if (String(got) !== String(spec.check.value)){
              throw new Error('check fail got=' + got);
            }
          }
          // url 路径同理：["body","data","url"]
          var url = spec.url ? dig(resp2, spec.url) : null;
          if (!url) url = spec.url ? dig(b2, spec.url.slice(1)) : null;
          if (!url && b2 && b2.data) url = b2.data.url;
          if (!url) throw new Error('no url in step2');
          return url;
        });
      }

      throw new Error((b && b.msg) || ('code=' + (b && b.code)));
    });
  });
})();
