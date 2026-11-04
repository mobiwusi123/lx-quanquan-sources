/*!
 * @name 圈圈探针
 * @version 3
 */
;(function(){
  var lx = globalThis.lx;
  var EV = lx.EVENT_NAMES;
  lx.send(EV.inited, {
    sources: {
      kw: { name:'酷我', type:'music', actions:['musicUrl'], qualitys:['128k','320k','flac'] },
      mg: { name:'咪咕', type:'music', actions:['musicUrl'], qualitys:['128k','320k'] }
    }
  });
  lx.on(EV.request, function(payload){
    var mi = (payload.info && payload.info.musicInfo) || {};
    var keys = [];
    for (var k in mi){ keys.push(k + '=' + String(mi[k]).slice(0, 30)); }
    throw new Error('MI::' + keys.join(' | '));
  });
})();
