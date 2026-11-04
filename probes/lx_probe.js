/*!
 * @name 圈圈探针
 * @description 打印 LX 传进来的真实数据结构
 * @version 1
 */
;(function(){
  var lx = globalThis.lx;
  var EV = lx.EVENT_NAMES;

  lx.send(EV.inited, {
    sources: {
      kw: { type:'music', actions:['musicUrl'], qualitys:['128k','320k','flac'] },
      tx: { type:'music', actions:['musicUrl'], qualitys:['128k','320k','flac'] },
      wy: { type:'music', actions:['musicUrl'], qualitys:['128k','320k','flac'] },
      mg: { type:'music', actions:['musicUrl'], qualitys:['128k','320k','flac'] },
      kg: { type:'music', actions:['musicUrl'], qualitys:['128k','320k','flac'] }
    }
  });

  lx.on(EV.request, function(payload){
    // 把整个 payload 结构打出来
    var dump = '';
    try {
      dump = JSON.stringify(payload);
    } catch (e) {
      dump = 'stringify fail: ' + e.message;
    }
    console.log('PROBE_FULL::' + dump);
    console.log('PROBE_INFO_KEYS::' + Object.keys(payload.info || {}).join(','));
    console.log('PROBE_META::' + JSON.stringify(payload.info && payload.info.meta));
    throw new Error('probe dump done');
  });
})();
