// Outlina WebGL Wave & Bloom Engine
(function() {
  const quadVertexShader = `attribute vec2 a_uv;
varying vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = vec4(a_uv * 2.0 - 1.0, 0.0, 1.0);
}`;

  const softBlurFragmentShader = `precision highp float;
varying vec2 v_uv;
uniform sampler2D u_source;
uniform vec2 u_step;
void main() {
  vec4 colour = vec4(0.0);
  float total = 0.0;
  for (int i = -12; i <= 12; i++) {
    float n = float(i);
    float weight = exp(-n * n / 32.0);
    colour += texture2D(u_source, v_uv + n * u_step) * weight;
    total += weight;
  }
  gl_FragColor = colour / total;
}`;

  const wideBloomFragmentShader = `precision highp float;
varying vec2 v_uv;
uniform sampler2D u_source;
uniform vec2 u_step;
void main() {
  vec4 colour = vec4(0.0);
  float total = 0.0;
  for (int i = -24; i <= 24; i++) {
    float n = float(i);
    float weight = exp(-n * n / 128.0);
    colour += texture2D(u_source, v_uv + n * u_step) * weight;
    total += weight;
  }
  gl_FragColor = colour / total;
}`;

  const bloomCompositeFragmentShader = `precision highp float;
varying vec2 v_uv;
uniform sampler2D u_soft;
uniform sampler2D u_bloom;
uniform float u_ratio;
float noise(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}
void main() {
  vec4 soft = texture2D(u_soft, v_uv);
  vec4 bloom = texture2D(u_bloom, v_uv) * 0.35;
  vec4 merged = soft + bloom * (1.0 - soft.a);
  vec3 colour = merged.rgb / max(merged.a, 0.0001);
  vec2 p = floor(gl_FragCoord.xy / u_ratio);
  float grain = 0.5 + (noise(p) + noise(p * 1.73) - 1.0) * 0.25;
  vec3 low = colour - (1.0 - 2.0 * grain) * colour * (1.0 - colour);
  vec3 high = colour + (2.0 * grain - 1.0) * (sqrt(max(colour, vec3(0.0))) - colour);
  colour = mix(colour, grain < 0.5 ? low : high, 0.22);
  gl_FragColor = vec4(clamp(colour, 0.0, 1.0) * merged.a, merged.a);
}`;

  const simplexNoiseSource = `
vec3 mod289(vec3 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}
vec2 mod289(vec2 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}
vec3 permute(vec3 x) {
  return mod289(((x * 34.0) + 1.0) * x);
}
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187,
                      0.366025403784439,
                     -0.577350269189626,
                      0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                   + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}`;

  const waveVertexShader = `
attribute vec2 a_uv;
uniform float u_time;
uniform float u_aspect;
varying vec2 v_uv;
float oscillation(float x, float t, vec4 settings) {
  return settings.x * sin(settings.y * x + settings.z + settings.w * t);
}
void main() {
  v_uv = a_uv;
  float x = 6.0 * (a_uv.x - 0.5), v = a_uv.y, t = 0.7 * u_time;
  float baseline = oscillation(x, t, vec4(0.045, 0.75, 0.4, 0.1));
  float travel   = oscillation(x, t, vec4(0.075, 1.1, 0.2, 0.4));
  float breadth  = 0.24 + 0.045 * sin(1.35 * x + 1.2 + 0.32 * t);
  float fold     = 0.028 * sin(1.6 * x + 2.0 * v + 0.22 * t);
  float y = baseline + travel + 2.0 * (v - 0.5) * breadth + fold;
  float z = 1.5 * (v - 0.5);
  gl_Position = vec4(x / u_aspect, 2.0 * (y - 0.03 * z) / sqrt(1.0009) + 0.12 * x, -(z + 0.03 * y) * 0.02, 1.0);
}`;

  const waveFragmentShader = `
precision highp float;
varying vec2 v_uv;
uniform float u_time;
${simplexNoiseSource}
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 desaturate(vec3 c, float amount) { return mix(c, vec3(luma(c)), amount); }
void main() {
  vec2 p = v_uv * vec2(4.0, 1.0) * 0.35;
  float t = 0.2 * u_time;
  vec2 driftA = t * vec2(0.017, -0.013), driftB = t * vec2(-0.011, 0.019);
  vec2 first = vec2(snoise(p + driftA), snoise(p + vec2(5.2, 1.3) + 0.8 * driftA));
  vec2 second = vec2(snoise(p + 0.52 * first + vec2(1.7, 9.2) + driftB), snoise(p + 0.52 * first + vec2(8.3, 2.8) + 0.9 * driftB));
  float field = clamp(0.48 + 0.5 * snoise(p + 0.52 * second + t * 0.015), 0.0, 1.0);
  field = mix(field, 0.45 + 0.4 * cos(v_uv.x * 6.283185 + 0.25 * t), 0.7);
  float focus = 0.5 * smoothstep(0.2, 0.6, snoise(0.5 * p + vec2(4.3, 7.9) + 0.4 * driftB));
  vec3 cool = desaturate(vec3(0.173, 0.545, 1.0), 0.12);
  vec3 pale = vec3(0.94, 0.935, 0.9);
  vec3 gold = desaturate(vec3(0.98, 0.92, 0.68), 0.2);
  vec3 amber = desaturate(vec3(1.0, 0.686, 0.224), 0.35);
  vec3 colour = mix(cool, pale, smoothstep(0.34, mix(0.53, 0.49, focus), field));
  colour = mix(colour, mix(gold, amber, smoothstep(0.65, 1.0, field)), smoothstep(mix(0.46, 0.49, focus), mix(0.63, 0.60, focus), field));
  float glow = smoothstep(0.2, 0.4, field) * (1.0 - smoothstep(0.5, 0.85, field));
  colour = mix(colour, vec3(1.0), 0.08 * glow);
  colour = mix(vec3(luma(colour)), colour, 1.5);
  float haze = smoothstep(-0.1, 0.4, snoise(v_uv * 1.5 + vec2(13.7, 3.1) + 0.6 * driftA)) * smoothstep(-0.2, 0.3, snoise(v_uv * 0.8 + vec2(6.2, 11.8) + 0.4 * driftB));
  colour = mix(colour, vec3(1.0), haze * 0.05);
  float brightest = max(colour.r, max(colour.g, colour.b));
  float saturation = (brightest - min(colour.r, min(colour.g, colour.b))) / (brightest + 0.001);
  float amount = 0.08 + 0.06 * (1.0 - saturation) * smoothstep(0.5, 0.8, luma(colour));
  float product = snoise(gl_FragCoord.xy * 0.25 + u_time * 0.15) * snoise(gl_FragCoord.xy * 0.45 - u_time * 0.12);
  float grain = max(0.0, sign(product) * max(0.0, abs(product) - 0.02) * 2.5);
  colour += vec3(0.08, 0.08, 0.07) * grain * amount * 15.0;
  float edge = smoothstep(0.0, 0.005, min(v_uv.y, 1.0 - v_uv.y));
  gl_FragColor = vec4(clamp(colour, 0.0, 1.0), edge);
}`;

  const glassVertexShader = `
attribute vec2 a_uv;
varying vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = vec4(a_uv * 2.0 - 1.0, 0.0, 1.0);
}`;

  const glassFragmentShader = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_wave;
uniform vec2 u_size;
uniform vec4 u_frame;
uniform float u_radius;
uniform float u_rim;
void main() {
  vec2 pixel = vec2(v_uv.x, 1.0 - v_uv.y) * u_size;
  vec2 centre = u_frame.xy + u_frame.zw * 0.5;
  vec2 p = pixel - centre;
  vec2 q = abs(p) - (u_frame.zw * 0.5 - vec2(u_radius));
  float distance = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - u_radius;
  float mask = (1.0 - smoothstep(-1.0, 1.0, distance)) * smoothstep(-u_rim - 1.0, -u_rim + 1.0, distance);
  vec2 corner = max(q, 0.0);
  vec2 normal = length(corner) > 0.001 ? normalize(corner) * sign(p) : (q.x > q.y ? vec2(sign(p.x), 0.0) : vec2(0.0, sign(p.y)));
  float bevel = clamp(-distance / u_rim, 0.0, 1.0);
  float curvature = sin(bevel * 3.14159265);
  float cornerBoost = 1.0 + 0.35 * step(0.0, min(q.x, q.y));
  vec2 offset = normal * curvature * 9.0 * cornerBoost * mask;
  vec2 sampleUV = v_uv + vec2(offset.x, -offset.y) / u_size;
  vec4 colour = texture2D(u_wave, clamp(sampleUV, 0.0, 1.0));
  gl_FragColor = colour;
}`;

  function initWaveCanvas(canvas) {
    if (!canvas) return;
    delete canvas.dataset.waveReady;
    delete canvas.dataset.waveBloom;

    const gl = canvas.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: true });
    if (!gl) {
      console.warn("WebGL not supported for wave effect");
      return;
    }

    const shaders = [];
    const compile = (type, src) => {
      const sh = gl.createShader(type);
      if (!sh) return null;
      shaders.push(sh);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error("Shader compile error:", gl.getShaderInfoLog(sh));
        return null;
      }
      return sh;
    };

    const waveVS = compile(gl.VERTEX_SHADER, waveVertexShader);
    const waveFS = compile(gl.FRAGMENT_SHADER, waveFragmentShader);
    const waveProg = gl.createProgram();
    if (!waveVS || !waveFS || !waveProg) return;

    gl.attachShader(waveProg, waveVS);
    gl.attachShader(waveProg, waveFS);
    gl.linkProgram(waveProg);
    if (!gl.getProgramParameter(waveProg, gl.LINK_STATUS)) {
      console.error("Wave program link error:", gl.getProgramInfoLog(waveProg));
      return;
    }
    gl.useProgram(waveProg);

    // Glass Shader Program
    const glassVS = compile(gl.VERTEX_SHADER, glassVertexShader);
    const glassFS = compile(gl.FRAGMENT_SHADER, glassFragmentShader);
    const glassProg = gl.createProgram();
    if (glassProg && glassVS && glassFS) {
      gl.attachShader(glassProg, glassVS);
      gl.attachShader(glassProg, glassFS);
      gl.linkProgram(glassProg);
    }
    const hasGlass = !!glassProg && !!glassVS && !!glassFS && gl.getProgramParameter(glassProg, gl.LINK_STATUS);

    const waveTexture = gl.createTexture();
    const waveFBO = gl.createFramebuffer();
    const waveRBO = gl.createRenderbuffer();

    gl.bindTexture(gl.TEXTURE_2D, waveTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 1]), gl.STATIC_DRAW);

    const glassAttribUV = hasGlass ? gl.getAttribLocation(glassProg, "a_uv") : -1;
    const glassUniSize = hasGlass ? gl.getUniformLocation(glassProg, "u_size") : null;
    const glassUniFrame = hasGlass ? gl.getUniformLocation(glassProg, "u_frame") : null;
    const glassUniRadius = hasGlass ? gl.getUniformLocation(glassProg, "u_radius") : null;
    const glassUniRim = hasGlass ? gl.getUniformLocation(glassProg, "u_rim") : null;

    const glassFrameEl = canvas.closest("section")?.querySelector("[data-waitlist-glass]") || document.querySelector("[data-waitlist-glass]");
    let frameRect = [0, 0, 0, 0];
    let cssWidth = 1, cssHeight = 1;
    let borderRadius = 26, rimWidth = 11;
    let isGlassActive = false;

    // Generate mesh vertices
    const meshCols = Math.max(100, Math.min(500, Math.round(0.3 * (canvas.getBoundingClientRect().width || 1200))));
    const meshRows = 8;
    const meshData = [];
    for (let c = 0; c < meshCols; c++) {
      for (let r = 0; r < meshRows; r++) {
        let u0 = c / meshCols, u1 = (c + 1) / meshCols;
        let v0 = r / meshRows, v1 = (r + 1) / meshRows;
        meshData.push(u0, v0, u1, v0, u0, v1, u1, v0, u1, v1, u0, v1);
      }
    }

    const meshBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, meshBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(meshData), gl.STATIC_DRAW);

    const waveAttribUV = gl.getAttribLocation(waveProg, "a_uv");
    gl.enableVertexAttribArray(waveAttribUV);
    gl.vertexAttribPointer(waveAttribUV, 2, gl.FLOAT, false, 0, 0);

    const waveUniTime = gl.getUniformLocation(waveProg, "u_time");
    const waveUniAspect = gl.getUniformLocation(waveProg, "u_aspect");

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    // Bloom Pipeline Setup
    const bloomPipeline = (function(gl) {
      const bloomShaders = [], bloomProgs = [], bloomTextures = [], bloomFBOs = [];
      const bloomQuadBuffer = gl.createBuffer();

      const dispose = () => {
        bloomShaders.forEach(s => gl.deleteShader(s));
        bloomProgs.forEach(p => gl.deleteProgram(p));
        bloomTextures.forEach(t => gl.deleteTexture(t));
        bloomFBOs.forEach(f => gl.deleteFramebuffer(f));
        gl.deleteBuffer(bloomQuadBuffer);
      };

      try {
        function createProg(fsSource) {
          const p = gl.createProgram();
          if (!p) throw new Error("bloom_prog");
          bloomProgs.push(p);
          const pairs = [[gl.VERTEX_SHADER, quadVertexShader], [gl.FRAGMENT_SHADER, fsSource]];
          for (const [t, s] of pairs) {
            const sh = gl.createShader(t);
            if (!sh) throw new Error("bloom_sh");
            bloomShaders.push(sh);
            gl.shaderSource(sh, s);
            gl.compileShader(sh);
            if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error("bloom_comp");
            gl.attachShader(p, sh);
          }
          gl.linkProgram(p);
          if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error("bloom_link");
          return p;
        }

        const progSoft = createProg(softBlurFragmentShader);
        const progWide = createProg(wideBloomFragmentShader);
        const progComp = createProg(bloomCompositeFragmentShader);

        const softUV = gl.getAttribLocation(progSoft, "a_uv");
        const softStep = gl.getUniformLocation(progSoft, "u_step");

        const wideUV = gl.getAttribLocation(progWide, "a_uv");
        const wideStep = gl.getUniformLocation(progWide, "u_step");

        const compUV = gl.getAttribLocation(progComp, "a_uv");
        const compRatio = gl.getUniformLocation(progComp, "u_ratio");

        gl.useProgram(progWide);
        gl.uniform1i(gl.getUniformLocation(progWide, "u_source"), 0);

        gl.useProgram(progSoft);
        gl.uniform1i(gl.getUniformLocation(progSoft, "u_source"), 0);

        gl.useProgram(progComp);
        gl.uniform1i(gl.getUniformLocation(progComp, "u_soft"), 0);
        gl.uniform1i(gl.getUniformLocation(progComp, "u_bloom"), 1);

        gl.bindBuffer(gl.ARRAY_BUFFER, bloomQuadBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 1]), gl.STATIC_DRAW);

        for (let t = 0; t < 5; t++) {
          const tex = gl.createTexture();
          const fbo = gl.createFramebuffer();
          if (!tex || !fbo) throw new Error("bloom_target");
          bloomTextures.push(tex);
          bloomFBOs.push(fbo);
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        }

        let fullW = 0, fullH = 0, downW = 0, downH = 0, tinyW = 0, tinyH = 0;
        let viewW = 1, viewH = 1;
        let isConfigured = false;

        return {
          scene: bloomFBOs[0],
          dispose,
          resize(w, h, vw, vh) {
            viewW = vw; viewH = vh;
            if (w === fullW && h === fullH) return isConfigured;
            fullW = w; fullH = h;
            downW = Math.max(1, Math.round(vw));
            downH = Math.max(1, Math.round(vh));
            tinyW = Math.max(1, Math.round(0.125 * vw));
            tinyH = Math.max(1, Math.round(0.125 * vh));

            let statusOk = true;
            gl.activeTexture(gl.TEXTURE0);
            for (let i = 0; i < 5; i++) {
              gl.bindTexture(gl.TEXTURE_2D, bloomTextures[i]);
              const tw = (i === 0) ? fullW : (i < 3) ? downW : tinyW;
              const th = (i === 0) ? fullH : (i < 3) ? downH : tinyH;
              gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, tw, th, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
              gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFBOs[i]);
              statusOk = statusOk && (gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE);
            }
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            isConfigured = statusOk;
            return statusOk;
          },
          render() {
            gl.disable(gl.DEPTH_TEST);
            gl.disable(gl.BLEND);
            gl.bindBuffer(gl.ARRAY_BUFFER, bloomQuadBuffer);
            gl.viewport(0, 0, downW, downH);
            gl.activeTexture(gl.TEXTURE0);

            const drawPass = (uniStep, srcTexIdx, targetFboIdx, stepX, stepY) => {
              gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFBOs[targetFboIdx]);
              gl.bindTexture(gl.TEXTURE_2D, bloomTextures[srcTexIdx]);
              gl.uniform2f(uniStep, stepX, stepY);
              gl.drawArrays(gl.TRIANGLES, 0, 6);
            };

            // Wide bloom passes
            gl.useProgram(progWide);
            gl.enableVertexAttribArray(wideUV);
            gl.vertexAttribPointer(wideUV, 2, gl.FLOAT, false, 0, 0);
            drawPass(wideStep, 0, 1, 1 / viewW, 0);
            drawPass(wideStep, 1, 2, 0, 1 / viewH);

            // Soft blur passes
            gl.useProgram(progSoft);
            gl.enableVertexAttribArray(softUV);
            gl.vertexAttribPointer(softUV, 2, gl.FLOAT, false, 0, 0);
            gl.viewport(0, 0, tinyW, tinyH);
            drawPass(softStep, 0, 3, 7 / viewW, 0);
            drawPass(softStep, 3, 4, 0, 7 / viewH);

            // Final Composite Pass
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, fullW, fullH);
            gl.useProgram(progComp);
            gl.enableVertexAttribArray(compUV);
            gl.vertexAttribPointer(compUV, 2, gl.FLOAT, false, 0, 0);
            gl.bindTexture(gl.TEXTURE_2D, bloomTextures[2]);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, bloomTextures[4]);
            gl.uniform1f(compRatio, fullW / viewW);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
            gl.activeTexture(gl.TEXTURE0);
          }
        };
      } catch (err) {
        console.warn("Bloom setup failed:", err);
        dispose();
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return null;
      }
    })(gl);

    let hasBloom = false;
    let isInitialFrame = true;
    let animFrameId = 0;
    let isIntersecting = true;
    let lastTime = 0;
    let currentTime = 0;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const render = () => {
      const targetFBO = hasBloom ? bloomPipeline.scene : null;
      gl.bindFramebuffer(gl.FRAMEBUFFER, isGlassActive ? waveFBO : targetFBO);

      gl.useProgram(waveProg);
      gl.bindBuffer(gl.ARRAY_BUFFER, meshBuffer);
      gl.enableVertexAttribArray(waveAttribUV);
      gl.vertexAttribPointer(waveAttribUV, 2, gl.FLOAT, false, 0, 0);
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      gl.uniform1f(waveUniTime, currentTime);
      gl.uniform1f(waveUniAspect, canvas.width / canvas.height);
      gl.drawArrays(gl.TRIANGLES, 0, meshData.length / 2);

      // Glass bevel pass
      if (isGlassActive) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, targetFBO);
        gl.useProgram(glassProg);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.BLEND);
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
        gl.enableVertexAttribArray(glassAttribUV);
        gl.vertexAttribPointer(glassAttribUV, 2, gl.FLOAT, false, 0, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, waveTexture);
        gl.uniform2f(glassUniSize, cssWidth, cssHeight);
        gl.uniform4fv(glassUniFrame, frameRect);
        gl.uniform1f(glassUniRadius, borderRadius);
        gl.uniform1f(glassUniRim, rimWidth);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }

      if (hasBloom) {
        bloomPipeline.render();
      }

      if (isInitialFrame && cssWidth > 1) {
        isInitialFrame = false;
        canvas.dataset.waveReady = "true";
        canvas.dispatchEvent(new CustomEvent("waitlist-wave-ready", { bubbles: true }));
      }
    };

    const loop = (timestamp) => {
      if (!isIntersecting || document.hidden || prefersReducedMotion.matches) return;
      currentTime += Math.min((timestamp - lastTime) / 1000, 0.05);
      lastTime = timestamp;
      render();
      animFrameId = requestAnimationFrame(loop);
    };

    const restartLoop = () => {
      cancelAnimationFrame(animFrameId);
      lastTime = performance.now();
      render();
      if (isIntersecting && !document.hidden && !prefersReducedMotion.matches) {
        animFrameId = requestAnimationFrame(loop);
      }
    };

    const handleResize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cssWidth = rect.width;
      cssHeight = rect.height;
      const targetW = Math.round(rect.width * dpr);
      const targetH = Math.round(rect.height * dpr);

      const sizeChanged = (canvas.width !== targetW || canvas.height !== targetH);
      if (sizeChanged) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      if (glassFrameEl) {
        const fRect = glassFrameEl.getBoundingClientRect();
        const style = window.getComputedStyle(glassFrameEl);
        frameRect = [fRect.left - rect.left, fRect.top - rect.top, fRect.width, fRect.height];
        borderRadius = parseFloat(style.borderTopLeftRadius) || 26;
        rimWidth = (parseFloat(style.paddingLeft) || 10) + 1;
      }

      if (hasGlass && waveTexture && waveFBO && waveRBO && (sizeChanged || !isGlassActive)) {
        gl.bindTexture(gl.TEXTURE_2D, waveTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.bindRenderbuffer(gl.RENDERBUFFER, waveRBO);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, canvas.width, canvas.height);
        gl.bindFramebuffer(gl.FRAMEBUFFER, waveFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, waveTexture, 0);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, waveRBO);
        isGlassActive = !!glassFrameEl && (gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }

      hasBloom = !!bloomPipeline?.resize(targetW, targetH, cssWidth, cssHeight);
      canvas.dataset.waveBloom = hasBloom ? "gpu" : "css";
      render();
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(canvas);
    if (glassFrameEl) resizeObserver.observe(glassFrameEl);
    window.addEventListener("resize", handleResize);

    const intersectionObserver = new IntersectionObserver(([entry]) => {
      isIntersecting = entry.isIntersecting;
      restartLoop();
    });
    intersectionObserver.observe(canvas);

    prefersReducedMotion.addEventListener("change", restartLoop);
    document.addEventListener("visibilitychange", restartLoop);

    handleResize();
    restartLoop();
  }

  // Auto initialize on DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      const canvas = document.querySelector(".waitlist_waveCanvas__jbvI5") || document.querySelector("canvas");
      initWaveCanvas(canvas);
    });
  } else {
    const canvas = document.querySelector(".waitlist_waveCanvas__jbvI5") || document.querySelector("canvas");
    initWaveCanvas(canvas);
  }

  window.initWaveCanvas = initWaveCanvas;
})();
