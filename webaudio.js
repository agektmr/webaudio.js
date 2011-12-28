/*
 * Abstraction layer of Audio Element using Web Audio API
 * This library won't do following:
 * - show UI element
 * - stream audio
 * - fire events on readyState change
 */

if (!Function.prototype.bind) {
  Function.prototype.bind = function(scope) {
    var func = this;
    return function() {
      func.apply(scope, arguments);
    };
  }
}

var debug = true;

// TODO: support multiple sources
/* events to support
 * loadstart
 * progress
 * suspend
 * abort
 * error
 * emptied
 * stalled
 * seeking
 * seeked
 * playing
 * waiting
 * ended
 * durationchange
 * timeupdate
 * play
 * pause
 * ratechange
 * volumechange
 */

var WebAudio = (function() {
  window.AudioContext = (function() {
    return window.AudioContext ||
           window.webkitAudioContext ||
           window.mozAudioContext ||
           window.oAudioContext ||
           window.msAudioContext ||
           undefined;
  }());
  window.requestAnimationFrame = (function() {
    return window.requestAnimationFrame ||
           window.webkitRequestAnimationFrame || 
           window.mozRequestAnimationFrame    || 
           window.oRequestAnimationFrame      || 
           window.msRequestAnimationFrame     || 
           function(/* function */ callback, /* DOMElement */ element){
             window.setTimeout(callback, 1000 / 60);
           };
  }());
  var audioContext = new AudioContext();

  if (!!audioContext) {
    var AudioLoader = (function() {
      var cache = {}; 
      var fetch = function(srcUrl, callback) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', srcUrl, true);
        xhr.responseType = 'arraybuffer';
        cache[srcUrl] = {
          buffer: null,
          handler: xhr,
          httpStatus: null,
          state: null 
        };
        xhr.onreadystatechange = function() {
          cache[srcUrl].state = xhr.readyState;
          if (xhr.readyState == 4) {
            cache[srcUrl].httpStatus = xhr.status;
//          if (xhr.status == 200) {
              audioContext.decodeAudioData(xhr.response, function(buffer) {
                cache[srcUrl].buffer = buffer;
                cache[srcUrl].handler = null;
                cache[srcUrl].httpStatus = xhr.status;
                cache[srcUrl].state = xhr.readyState;
                callback.call(self, buffer);
              });
//          } else {
//          }
          }
        };
        xhr.send();
      }

      return {
        load: function(srcUrl, callback) {
          if (!!cache[srcUrl] && cache[srcUrl].httpStatus === 200) {
            callback(cache[srcUrl].buffer);
          } else {
            fetch(srcUrl, callback);
          }
          return;
        },
        abort: function(srcUrl) {
          if (!!cache[srcUrl]) {
            cache[srcUrl].handler.abort();
            return true;
          } else {
            return false;
          }
        },
        clearCache: function() {
          cache = {};
        }
      }
    }());

    var init = function() {
      var watchSet = {
        'src': __changeSrc,
        'volume': __changeVolume,
        'currentTime': __changeCurrentTime,
        'duration': __changeDuration,
        'loop': __changeLoop,
        'playbackRate': __changePlaybackRate,
        'muted': __changeMuted,
        'readyState': __changeReadyState,
        'networkState': __changeNetworkState
      };
      var self = this;
      for (var key in watchSet) {
        (function() {
          var _key = key;
          var func = watchSet[key];
          self.watch(key, function(id, oldVal, newVal) {
            return func.call(self, oldVal, newVal);
          });
        }());
      };
    }

    var __changeSrc = function(prevSrc, srcUrl) {
      this.src = srcUrl;
    }

    var __changeVolume = function(prevVol, volume) {
      if (typeof volume === 'number' && 0 <= volume && volume <= 1.0) {
        if (!!this._bufferSource) {
          this._bufferSource.gain.value = volume;
          _dispatchEvent.call(this, 'volumechange');
          return volume;
        }
      } else {
        throw DOMException.INDEX_SIZE_ERR;
      }
    }

    var __changeCurrentTime = function(prevCT, currentTime) {
      if (typeof currentTime === 'number' && 0 <= currentTime && currentTime <= this.duration) {
        if (!!this._bufferSource) {
          if (!this.paused) {
// TODO: should this be "seek"?
            __pause.call(this);
            _dispatchEvent.call(this, 'timeupdate');
            __play.call(this, currentTime);
          }
        }
      } else {
        throw DOMException.INDEX_SIZE_ERR;
      }
      return currentTime;
    }

    var __changeNetworkState = function(prevNS, networkState) {
if (debug) {
  var networkStates = [
    'NETWORK_EMPTY',
    'NETWORK_IDLE',
    'NETWORK_LOADING',
    'NETWORK_NO_SOURCE'
  ];
  console.debug('networkState:', networkStates[networkState]);
}
/*    switch (networkState) {
      case Audio.prototype.NETWORK_EMPTY :
        this.buffered = null;
        _dispatchEvent.call(this, 'emptied');
        // TODO: abort existing fetch
        this.readyState = Audio.prototype.HAVE_NOTHING;
        this.paused = true;
        this.seeking = false;
        this.currentTime = 0.0;
        this.startOffsetTime = NaN;
        this.duration = NaN;
        break;
      default :
        break;
      }
*/
      return networkState;
    }

    var __changeReadyState = function(prevRS, readyState) {
if (debug) {
  var readyStates = [
    'HAVE_NOTHING',
    'HAVE_METADATA',
    'HAVE_CURRENT_DATA',
    'HAVE_FUTURE_DATA',
    'HAVE_ENOUGH_DATA'
  ];
  console.debug('readyState:', readyStates[readyState]);
}
      /*
       * 4.8.10.7 The ready states
       */
      if (prevRS === Audio.prototype.HAVE_NOTHING && readyState === Audio.prototype.HAVE_METADATA) {
        _dispatchEvent.call(this, 'loadedmetadata');
      }
      if (prevRS === Audio.prototype.HAVE_METADATA && readyState === Audio.prototype.HAVE_CURRENT_DATA) {
// TODO: only the first time
        _dispatchEvent.call(this, 'loadeddata');
      }
      if (prevRS >= Audio.prototype.HAVE_FUTURE_DATA && readyState <= Audio.prototype.HAVE_CURRENT_DATA) {
        if (this.ended === false && this.paused === false && this.error === null) {
          _dispatchEvent.call(this, 'timeupdate');
          _dispatchEvent.call(this, 'waiting');
        }
      }
      if (prevRS <= Audio.prototype.HAVE_CURRENT_DATA && readyState === Audio.prototype.HAVE_FUTURE_DATA) {
        _dispatchEvent.call(this, 'canplay');
        if (this.paused === false) {
          _dispatchEvent.call(this, 'playing');
        }
      }
      if (readyState === Audio.prototype.HAVE_ENOUGH_DATA) {
        if (prevRS <= Audio.prototype.HAVE_CURRENT_DATA) {
          _dispatchEvent.call(this, 'canplay');
        }
        if (this.paused === false) {
          _dispatchEvent.call(this, 'playing');
        }
        if (this.autoplay === true && this.paused === true) {
//        this.paused = false;
          _dispatchEvent.call(this, 'play');
          _dispatchEvent.call(this, 'playing');
        }
        _dispatchEvent.call(this, 'canplaythrough');
      }
      return readyState;
    }

    var __changeDuration = function(prevDur, duration) {
      if (typeof duration === 'number' && 0 <= duration) {
        _dispatchEvent.call(this, 'durationchange');
      } else {
        throw DOMException.INDEX_SIZE_ERR;
      }
      return duration;
    }

    var __changeLoop = function(prevLp, loop) {
      return loop;
    }

    var __changePlaybackRate = function(prevPR, playbackRate) {
      if (typeof playbackRate === 'number' && -1.0 <= playbackRate && playbackRate <= 2.0) {
        if (!!this._bufferSource) {
          this._bufferSource.playbackRate.value = playbackRate;
          if (prevPR !== playbackRate) {
            _dispatchEvent.call(this, 'ratechange');
          }
        }
      } else {
        throw DOMException.INDEX_SIZE_ERR;
      }
      return playbackRate;
    }

    var __changeMuted = function(prevMt, muted) {
      return muted;
    }

    var selectResource = function() {
      var srcUrl = [];
      this.networkState = Audio.prototype.NETWORK_NO_SOURCE;
      if (this.src !== '') {
        srcUrl[0] = this.src;
      } else {
        var sources = this.getElementsByTagName('source');
        if (sources.length > 0) {
          for (var i = 0, l = sources.length; i < l; i++) {
            srcUrl.push(sources[i].src);
          }
        }
      }
      if (srcUrl.length == 0) {
        this.networkState = Audio.prototype.NETWORK_EMPTY;
        return [];
// TODO: abort?
      }
      this.preload = 'auto';
      this.networkState = Audio.prototype.NETWORK_LOADING;
      _dispatchEvent.call(this, 'loadstart');
      return srcUrl;
    }

    var fetchResource = function(srcUrl) {
      var self = this;
      var src = srcUrl[0];
      AudioLoader.load(src, function(buffer) {
        self._buffer = buffer;
        self.buffered = true;
        self.currentSrc = src;
        self.duration = buffer.duration;
//      self.readyState = Audio.prototype.HAVE_CURRENT_DATA;
        self.readyState = Audio.prototype.HAVE_ENOUGH_DATA;
        _dispatchEvent.call(self, 'loadeddata');
        self.preload = 'none';
        if (self.autoplay) self.play();
      }, function(response) { // response: {buffer:, handler:, httpStatus:, state:}
        self.networkState = Audio.prototype.NETWORK_NO_SOURCE;
        self.preload = 'none';
        _dispatchEvent.call(self, 'error');
      });
    }

    var __play = function(position, playbackRate) {
      var grainDuration = this.duration - position;
      this._bufferSource = audioContext.createBufferSource();
      this._bufferSource.buffer = this._buffer;
      this._bufferSource.playbackRate.value = playbackRate;
      this._bufferSource.loop = this.loop;
      this._bufferSource.gain.value = this.volume;
      this._bufferSource.connect(audioContext.destination);
      this._bufferSource.noteGrainOn(0, position, grainDuration);
      this._startTime = audioContext.currentTime;
    }

    var __pause = function() {
      this._bufferSource.noteOff(0);
    }

    var seek = function(position) {
      _dispatchEvent.call(this, 'timeupdate');
    }

    var _dispatchEvent = function(type) {
if (debug) {
  console.debug('event:',type);
}
      if (typeof this['on'+type] == 'function') {
        this['on'+type]();
        return;
      }
      if (!this._eventListener[type]) return;
      for (var i = 0; i < this._eventListener[type].length; i++) {
        var listener = this._eventListener[type][i];
        listener();
      }
      return;
    }

    var WebAudio = function(srcUrl) {
      this.src = srcUrl || '';
      this._buffer = null;
      this._bufferSource = null;
//    this._bufferSource = audioContext.createBufferSource();
//    this._bufferSouce.connect(audioContext.destination);
      this._startTime = 0.0;
      this._eventListener = [];
      init.call(this);

      if (!!srcUrl) this.load();
    };
    WebAudio.prototype = document.createElement('div');
    WebAudio.prototype.error = null;
    WebAudio.prototype.src = '';
    WebAudio.prototype.currentSrc = '';
    WebAudio.prototype.networkState = Audio.prototype.NETWORK_EMPTY;
    WebAudio.prototype.preload = 'auto';
    WebAudio.prototype.buffered = '';
    WebAudio.prototype.readyState = Audio.prototype.HAVE_NOTHING;
    WebAudio.prototype.seeking = false
    WebAudio.prototype.currentTime = 0.0;
    WebAudio.prototype.initialTime = 0.0;
    WebAudio.prototype.duration = NaN;
    WebAudio.prototype.startOffsetTime = NaN;
    WebAudio.prototype.paused = true;
    WebAudio.prototype.playbackRate = 1.0;
    WebAudio.prototype.defaultPlaybackRate = 1.0;
    WebAudio.prototype.played = null;
    WebAudio.prototype.seekable = null;
    WebAudio.prototype.ended = false;
    WebAudio.prototype.autoplay = true;
    WebAudio.prototype.loop = false;
    WebAudio.prototype.mediaGroup = null;
    WebAudio.prototype.controller = null;
    WebAudio.prototype.controls = false;
    WebAudio.prototype.volume = 1.0;
    WebAudio.prototype.muted = false;
    WebAudio.prototype.defaultMuted = false;
    WebAudio.prototype.audioTracks = null;
    WebAudio.prototype.load = function() {
      /*                            *
       * resource loading algorithm *
       *                            */
      // TODO: abort all resource selection algorithm
      if (this.networkState === Audio.prototype.NETWORK_LOADING ||
          this.networkState === Audio.prototype.NETWORK_IDLE) {
        // TODO: abort event
      }
      if (this.networkState !== Audio.prototype.NETWORK_EMPTY) {
        _dispatchEvent.call(this, 'emptied');
        // TODO: stop fetching process
        this.networkState = Audio.prototype.NETWORK_EMPTY;
        this.readyState = Audio.prototype.HAVE_NOTHING;
        this.paused = true;
        this.seeking = false;
        if (this.currentTime !== 0.0) {
          this.currentTime = 0.0;
          _dispatchEvent.call(this, 'timeupdate');
        }
        // TODO: set timeline offset to NaN
        this.startOffsetTime = NaN;
        this.duration = NaN;
      }
      this.playbackRate = this.defaultPlaybackRate;
      this.error = null;
      this.autoplay = true; // TODO: should be true?
      // TODO: stop playback
      var srcUrl = selectResource.call(this);
      fetchResource.call(this, srcUrl);
    };
    WebAudio.prototype.canPlayType = function() {
    };
    WebAudio.prototype.play = function() {
      if (this.networkState === Audio.prototype.NETWORK_EMPTY) {
// TODO: invoke resource selection algorithm
      }
      if (this.ended) {
// TODO: seek to the beginning
        seek.call(this, 0.0);
      }
      if (!this.paused) return;
      _dispatchEvent.call(this, 'play');
      if (this.readyState === Audio.prototype.HAVE_NOTHING ||
          this.readyState === Audio.prototype.HAVE_METADATA ||
          this.readyState === Audio.prototype.HAVE_CURRENT_DATA) {
        _dispatchEvent.call(this, 'waiting');
return;
      } else if (this.readyState === Audio.prototype.HAVE_FUTURE_DATA ||
          this.readyState === Audio.prototype.HAVE_ENOUGH_DATA) {
        _dispatchEvent.call(this, 'playing');
      } else {
        throw new WebAudioException('readyState not defined');
      }
      this.paused = false;
      this.autoplay = false;
      __play.call(this, this.currentTime, this.playbackRate);
    };
    WebAudio.prototype.pause = function() {
      if (this.networkState === Audio.prototype.NETWORK_EMPTY) {
var srcUrl = selectResource.call(this); // TODO
      }
      this.autoplay = false;
      if (this.paused) return;
      this.paused = true;
      _dispatchEvent.call(this, 'timeupdate');
      _dispatchEvent.call(this, 'pause');
      __pause.call(this);
      this.currentTime = (audioContext.currentTime - this._startTime) * this.playbackRate;
    };
  };
  WebAudio.prototype.watch = function(prop, handler) {
    var oldVal = this[prop], newVal = oldVal,
    getter = function() {
      return newVal;
    },
    setter = function(val) {
      oldVal = newVal;
      return newVal = handler.call(this, prop, oldVal, val);
    };
    if (delete this[prop]) {
      if (WebAudio.defineProperty) {
        WebAudio.defineProperty(this, prop, {
          get: getter,
          set: setter,
          enumerable: true,
          configurable: true
        });
      } else if (WebAudio.prototype.__defineGetter__ && WebAudio.prototype.__defineSetter__) {
        WebAudio.prototype.__defineGetter__.call(this, prop, getter);
        WebAudio.prototype.__defineSetter__.call(this, prop, setter);
      }
    }
  };
  WebAudio.prototype.unwatch = function(prop) {
    var val = this[prop];
    delete this[prop];
    this[prop] = val;
  };

  return function(srcUrl) {
    return new WebAudio(srcUrl);
  };
}());
