/*!
 * @name 圈圈音源
 * @description oiapi 双平台 v13（酷我 + 咪咕，任一可用即可）
 * @version 13
 * @author 圈圈
 */
;(function(){
  var lx = globalThis.lx;
  var EV = lx.EVENT_NAMES;
  var API = 'https://oiapi.net/api/';

  function toObj(v){
    if (typeof v === 'string'){ try { return JSON.parse(v); } catch(e){ return null; } }
    return (v && typeof v === 'object') ? v : null;
  }
  function httpOnce(url, opts, ms){
    return new Promise(function(resolve, reject){
      var done = false;
      var timer = setTimeout(function(){
        if (done) return; done = true;
        reject(new Error('timeout'));
      }, ms || 12000);
      try {
        lx.request(url, opts || { method:'GET' }, function(err, resp){
          if (done) return; done = true; clearTimeout(timer);
          if (resp && resp.body) return resolve(resp);
          reject(new Error('net:' + String(err).slice(0,40)));
        });
      } catch(e){
        if (done) return; done = true; clearTimeout(timer);
        reject(e);
      }
    });
  }
  function pickUrl(raw){
    var o = toObj(raw);
    if (o){
      if (o.data && o.data.url) return o.data.url;
      if (o.url) return o.url;
    }
    var s = typeof raw === 'string' ? raw : JSON.stringify(raw);
    var m = s.match(/"url"\s*:\s*"([^"]+)"/);
    if (m) return m[1];
    m = s.match(/(https?:\/\/[^\s"'\u00b1,]+)/);
    if (m) return m[1];
    return null;
  }

  // 声明两个源都支持
  lx.send(EV.inited, {
    sources: {
      kw: { name:'酷我音乐', type:'music', actions:['musicUrl'], qualitys:['128k','320k','flac'] },
      mg: { name:'咪咕音乐', type:'music', actions:['musicUrl'], qualitys:['128k','320k'] }
    }
  });

  function queryOne(ep, keyword){
    return httpOnce(API + ep + '?msg=' + encodeURIComponent(keyword) + '&n=1&type=json', { method:'GET' }, 12000)
      .then(function(resp){
        var u = pickUrl(resp.body);
        if (!u) throw new Error(ep + ' no url');
        return u;
      });
  }

  lx.on(EV.request, function(payload){
    if (payload.action !== 'musicUrl') throw new Error('bad action ' + payload.action);
    var info = payload.info || {};
    var name = info.name || info.songName || '';
    var singer = info.singer || '';
    if (!name) return Promise.reject(new Error('no name'));

    var full = name + (singer ? ' ' + singer : '');

    // 依次尝试：本平台 -> 另一平台 -> 只搜歌名
    var plan = [];
    if (payload.source === 'mg'){
      plan.push(['MiGu_Music', full], ['Kuwo', full], ['MiGu_Music', name], ['Kuwo', name]);
    } else {
      plan.push(['Kuwo', full], ['MiGu_Music', full], ['Kuwo', name], ['MiGu_Music', name]);
    }

    var i = 0;
    function step(){
      if (i >= plan.length) return Promise.reject(new Error('all failed'));
      var p = plan[i++];
      return queryOne(p[0], p[1]).catch(function(e){
        if (i >= plan.length) throw e;
        return step();
      });
    }
    return step().then(function(u){
      var type = info.type || '128k';
      if (type === '320k' && u.indexOf('bitrate$128') >= 0) u = u.replace('bitrate$128', 'bitrate$320');
      return u;
    });
  });
})();
