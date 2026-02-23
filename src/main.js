import "./style.css";

const vertexSrc = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
  }
`;

const fragmentSrc = `
  precision highp float;
  varying vec2 v_texCoord;
  uniform sampler2D u_image;
  uniform vec2 u_mouse;
  uniform float u_hover;
  uniform float u_time;

  // Simplex-style noise for organic distortion
  vec2 hash(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(dot(hash(i), f), dot(hash(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
      mix(dot(hash(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)), dot(hash(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  void main() {
    vec2 uv = v_texCoord;
    float dist = distance(uv, u_mouse);

    // Radius of effect
    float radius = 0.15;
    float strength = smoothstep(radius, 0.0, dist) * u_hover;

    // Organic watercolor displacement using layered noise
    float t = u_time * 0.3;
    vec2 displacement = vec2(
      noise(uv * 8.0 + t) + noise(uv * 16.0 - t) * 0.5,
      noise(uv * 8.0 + 50.0 + t) + noise(uv * 16.0 + 50.0 - t) * 0.5
    );

    // Apply displacement with watercolor-like spread
    vec2 displaced_uv = uv + displacement * strength * 0.04;

    // Sample multiple nearby points for a bleeding/blending effect
    vec4 color = texture2D(u_image, displaced_uv);
    vec4 c1 = texture2D(u_image, displaced_uv + vec2(0.003, 0.001) * strength);
    vec4 c2 = texture2D(u_image, displaced_uv + vec2(-0.002, 0.003) * strength);
    vec4 c3 = texture2D(u_image, displaced_uv + vec2(0.001, -0.003) * strength);

    // Blend for soft watercolor bleeding
    color = mix(color, (color + c1 + c2 + c3) / 4.0, strength * 0.8);

    gl_FragColor = color;
  }
`;

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function init() {
  const canvas = document.getElementById("watercolor-canvas");
  const gl = canvas.getContext("webgl", { premultipliedAlpha: false });
  if (!gl) return;

  const img = new Image();
  img.src = "/temple.png";
  img.onload = () => {
    // Size canvas to match image aspect ratio within 65vh
    const maxH = window.innerHeight * 0.65;
    const scale = Math.min(maxH / img.height, 1);
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;
    canvas.style.width = canvas.width + "px";
    canvas.style.height = canvas.height + "px";

    // Shaders
    const vs = createShader(gl, gl.VERTEX_SHADER, vertexSrc);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, fragmentSrc);
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.useProgram(program);

    // Fullscreen quad
    const positions = new Float32Array([
      -1, -1, 0, 1,
       1, -1, 1, 1,
      -1,  1, 0, 0,
       1,  1, 1, 0,
    ]);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    const aPos = gl.getAttribLocation(program, "a_position");
    const aTex = gl.getAttribLocation(program, "a_texCoord");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(aTex);
    gl.vertexAttribPointer(aTex, 2, gl.FLOAT, false, 16, 8);

    // Texture
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);

    // Uniforms
    const uMouse = gl.getUniformLocation(program, "u_mouse");
    const uHover = gl.getUniformLocation(program, "u_hover");
    const uTime = gl.getUniformLocation(program, "u_time");

    let mouse = { x: 0.5, y: 0.5 };
    let hover = 0;
    let targetHover = 0;

    canvas.addEventListener("mousemove", (e) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = (e.clientX - rect.left) / rect.width;
      mouse.y = (e.clientY - rect.top) / rect.height;
    });

    canvas.addEventListener("mouseenter", () => { targetHover = 1; });
    canvas.addEventListener("mouseleave", () => { targetHover = 0; });

    function render(time) {
      // Smooth hover transition
      hover += (targetHover - hover) * 0.05;

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.uniform1f(uHover, hover);
      gl.uniform1f(uTime, time * 0.001);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      requestAnimationFrame(render);
    }

    requestAnimationFrame(render);
  };
}

init();

// Scroll-driven SVG border animation
const borderTop = document.querySelector(".svg-border-top");
const borderBottom = document.querySelector(".svg-border-bottom");

window.addEventListener("scroll", () => {
  const scrollY = window.scrollY;
  borderTop.style.transform = `translateX(${scrollY * 0.5}px)`;
  borderBottom.style.transform = `scaleY(-1) translateX(${-scrollY * 0.5}px)`;
});
