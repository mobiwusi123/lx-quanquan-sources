/*!
 * @name 圈圈音源
 * @description 五平台取播放链接 v5（带重试，抗首包慢）
 * @version 5
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

  function toObj(v){
    if (typeof v === 'string'){
      try { return JSON.parse(v); } catch (e) { return null; }
    }
    return (v && typeof v === 'object') ? v : null;
  }

  // 单次请求，20 秒兜底；err 不为空时仍优先看 resp 里有没有数据
  function httpOnce(url, opts){
    return new Promise(function(resolve, reject){
      var settled = false;
      var timer = setTimeout(function(){
        if (settled) return;
        settled = true;
        reject(new Error('timeout'));
      }, 20000);

      try {
        lx.request(url, opts || { method: 'GET' }, function(err, resp){
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          var b = resp ? toObj(resp.body) : null;
          if (b && (resp.code !== undefined || b.code !== undefined)) return resolve(resp);
          if (resp && resp.body) return resolve(resp);
          reject(new Error('net:' + String(err).slice(0, 60)));
        });
      } catch (e) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(e);
      }
    });
  }

  // 带重试：首包慢/被 Abort 时自动再来，最多 3 次
  function http(url, opts, retries){
    var left = (retries === undefined) ? 3 : retries;
    function attempt(n){
      return httpOnce(url, opts).catch(function(e){
        if (n <= 1) throw e;
        return new Promise(function(r){ setTimeout(r, 800); }).then(function(){
          return attempt(n - 1);
        });
      });
    }
    return attempt(left);
  }

  function bodyOf(resp){
    var b = toObj(resp && resp.body);
    if (b) return b;
    var r = toObj(resp);
    if (r) return r;
    throw new Error('bad body');
  }

  // 初始化：最多试 4 次，全失败也不抛到顶层，避免整个源标红
  function doInit(tries){
    return http(API + '/init.conf', { method: 'GET' }, 1).then(function(resp){
      var b = bodyOf(resp);
      if (!b || b.code !== 200) throw new Error('code=' + (b && b.code));
      lx.send(EV.inited, b.data.init);
    }).catch(function(e){
      if (tries > 1){
        return new Promise(function(r){ setTimeout(r, 1500); }).then(function(){
          return doInit(tries - 1);
        });
      }
      throw new Error('init:' + (e && e.message ? e.message : String(e)));
    });
  }
  doInit(4);

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
      var b = bodyOf(resp);

      if (b.code === 200 && b.data && b.data.url) return b.data.url;

      if (b.code === 303 && b.data && b.data.request){
        var req = b.data.request;
        var spec = b.data.response || {};

        return http(req.url, req.options || { method: 'GET' }).then(function(resp2){
          var b2 = bodyOf(resp2);

          if (spec.check && spec.check.key){
            var got = dig(resp2, spec.check.key);
            if (got === undefined) got = dig(b2, spec.check.key.slice(1));
            if (String(got) !== String(spec.check.value)){
              throw new Error('check got=' + got + ' want=' + spec.check.value);
            }
          }

          var url = spec.url ? dig(resp2, spec.url) : null;
          if (!url && spec.url) url = dig(b2, spec.url.slice(1));
          if (!url && b2 && b2.data) url = b2.data.url;
          if (!url) throw new Error('no url');
          return url;
        });
      }

      throw new Error((b && b.msg) || ('code=' + (b && b.code)));
    });
  });
})();
