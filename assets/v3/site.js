(() => {
  'use strict';

  const $$ = (selector, context = document) => Array.from(context.querySelectorAll(selector));

  // Guarda o idioma escolhido para a raiz saber para onde enviar na próxima visita.
  $$('a.lang-btn').forEach((link) => {
    link.addEventListener('click', () => {
      try { localStorage.setItem('kp-lang', link.dataset.lang); } catch (error) {}
    });
  });

  // Faz todas as leituras de layout antes de escrever estilos. Isso evita o
  // reflow forçado que acontecia ao alternar style e getBoundingClientRect().
  const initReveal = () => {
    const nodes = $$('[data-reveal]');
    const viewportHeight = window.innerHeight || 800;
    const measurements = nodes.map((node) => {
      const siblings = Array.from(node.parentElement.children)
        .filter((child) => child.hasAttribute('data-reveal'));
      const box = node.getBoundingClientRect();
      return {
        node,
        delay: Math.max(siblings.indexOf(node), 0) * 80,
        visible: box.top < viewportHeight && box.bottom > 0
      };
    });

    let pending = measurements.filter((item) => !item.visible).length;
    let observer = null;

    if (pending) {
      observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('rv-on');
          observer.unobserve(entry.target);
          pending -= 1;
          if (!pending) { observer.disconnect(); observer = null; }
        });
      }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
    }

    measurements.forEach(({ node, delay, visible }) => {
      if (delay) node.style.transitionDelay = `${delay}ms`;
      if (visible) node.classList.add('rv-on');
      else observer.observe(node);
    });
  };

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const desktop = window.matchMedia('(min-width: 768px)');
  const threeUrl = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  const threeIntegrity = 'sha512-dLxUelApnYxpLt6K2iomGngnHO83iUvZytA3YjDUCjT0HDOHKXnVYdf3hU4JjM8uEhxf9nD1/ey98U3t2vZ0qQ==';

  let threePromise = null;
  let built = false;
  let noWebGL = false;
  let frame = 0;
  let renderer = null;
  let geometry = null;
  let material = null;
  let onMove = null;
  let onLeave = null;
  let onResize = null;
  let onVisibility = null;
  let heroObserver = null;

  const loadThree = () => {
    if (window.THREE) return Promise.resolve(window.THREE);
    if (threePromise) return threePromise;

    threePromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = threeUrl;
      script.integrity = threeIntegrity;
      script.crossOrigin = 'anonymous';
      script.referrerPolicy = 'no-referrer';
      script.onload = () => resolve(window.THREE);
      script.onerror = reject;
      document.head.appendChild(script);
    });
    return threePromise;
  };

  const teardownScene = () => {
    if (frame) cancelAnimationFrame(frame);
    if (onMove) window.removeEventListener('pointermove', onMove);
    if (onLeave) document.documentElement.removeEventListener('pointerleave', onLeave);
    if (onResize) window.removeEventListener('resize', onResize);
    if (onVisibility) document.removeEventListener('visibilitychange', onVisibility);
    if (heroObserver) heroObserver.disconnect();

    const host = document.getElementById('hero-canvas');
    if (host) host.classList.remove('has-webgl');
    if (renderer) {
      renderer.domElement.remove();
      renderer.dispose();
    }
    if (geometry) geometry.dispose();
    if (material) material.dispose();

    built = false;
    frame = 0;
    renderer = null;
    geometry = null;
    material = null;
    onMove = null;
    onLeave = null;
    onResize = null;
    onVisibility = null;
    heroObserver = null;
  };

  const buildScene = () => {
    if (built || noWebGL || !window.THREE || !desktop.matches || reduceMotion.matches) return;
    const host = document.getElementById('hero-canvas');
    if (!host || !host.clientWidth || !host.clientHeight) return;

    const THREE = window.THREE;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    } catch (error) {
      noWebGL = true;
      return;
    }

    built = true;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(host.clientWidth, host.clientHeight);
    host.appendChild(renderer.domElement);
    host.classList.add('has-webgl');

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, host.clientWidth / host.clientHeight, 0.1, 100);
    camera.position.set(0, 1.4, 6);

    const size = 90;
    const span = 20;
    const positions = new Float32Array(size * size * 3);
    let cursor = 0;
    for (let x = 0; x < size; x += 1) {
      for (let z = 0; z < size; z += 1) {
        positions[cursor++] = (x / (size - 1) - 0.5) * span;
        positions[cursor++] = 0;
        positions[cursor++] = (z / (size - 1) - 0.5) * span;
      }
    }

    geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    material = new THREE.PointsMaterial({
      color: 0x9a9a9e,
      size: 0.022,
      transparent: true,
      opacity: 0.55,
      sizeAttenuation: true
    });

    let shader = null;
    material.onBeforeCompile = (compiled) => {
      compiled.uniforms.uTime = { value: 0 };
      compiled.uniforms.uPointer = { value: new THREE.Vector2(99, 99) };
      compiled.uniforms.uIntro = { value: 0 };
      compiled.uniforms.uScroll = { value: 0 };
      compiled.vertexShader = `
uniform float uTime;
uniform float uIntro;
uniform float uScroll;
uniform vec2 uPointer;
varying float vEnergy;
varying float vIntro;

float kpHash(vec2 point) {
  return fract(sin(dot(point, vec2(12.9898, 78.233))) * 43758.5453);
}
${compiled.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float order = kpHash(position.xz);
        vIntro = smoothstep(order * 0.72, order * 0.72 + 0.28, uIntro);

        float breathing = sin(transformed.x * 0.7 + uTime * 0.28) * 0.11
          + cos(transformed.z * 0.6 + uTime * 0.2) * 0.11;
        float pointerDistance = distance(transformed.xz, uPointer);
        float pointerLift = exp(-pointerDistance * pointerDistance * 0.52) * 0.68;

        float pulsePhase = mod(uTime, 12.0);
        float pulsePosition = -18.0 + pulsePhase * 3.0;
        float pulseDistance = abs((transformed.x + transformed.z) - pulsePosition);
        float pulse = 1.0 - smoothstep(0.0, 1.15, pulseDistance);
        pulse *= smoothstep(0.25, 1.0, pulsePhase);
        pulse *= 1.0 - smoothstep(10.8, 12.0, pulsePhase);

        vEnergy = max(pointerLift * 0.55, pulse);
        transformed.y = breathing + pointerLift + pulse * 0.12;
        transformed.y -= (1.0 - vIntro) * (1.3 + order * 1.5);
        transformed.y -= uScroll * 0.35;`
      )}`;
      compiled.fragmentShader = `
varying float vEnergy;
varying float vIntro;
${compiled.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float signal = smoothstep(0.08, 0.78, vEnergy);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.118, 0.784, 0.878), signal);
        diffuseColor.a *= vIntro * (0.74 + signal * 0.26);`
      )}`;
      shader = compiled;
    };

    const points = new THREE.Points(geometry, material);
    points.position.y = -1.4;
    scene.add(points);

    let mouseX = 0;
    let mouseY = 0;
    let targetX = 0;
    let targetY = 0;
    let pointerX = 99;
    let pointerZ = 99;
    let targetPointerX = 99;
    let targetPointerZ = 99;
    let scrollAmount = 0;
    let onScreen = true;
    let elapsed = 0;
    let introElapsed = 0;
    const clock = new THREE.Clock();

    onResize = () => {
      if (!desktop.matches || reduceMotion.matches) return;
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
    };
    onMove = (event) => {
      if (event.pointerType && event.pointerType !== 'mouse') return;
      targetX = event.clientX / window.innerWidth - 0.5;
      targetY = event.clientY / window.innerHeight - 0.5;
      targetPointerX = targetX * 12;
      targetPointerZ = targetY * 10;
    };
    onLeave = () => {
      targetX = 0;
      targetY = 0;
      targetPointerX = 99;
      targetPointerZ = 99;
    };

    const tick = () => {
      frame = requestAnimationFrame(tick);
      const delta = Math.min(clock.getDelta(), 0.05);
      elapsed += delta;
      introElapsed += delta;
      scrollAmount += (Math.min(window.scrollY / Math.max(window.innerHeight * 0.8, 1), 1) - scrollAmount) * 0.06;
      pointerX += (targetPointerX - pointerX) * 0.075;
      pointerZ += (targetPointerZ - pointerZ) * 0.075;

      if (shader) {
        shader.uniforms.uTime.value = elapsed;
        shader.uniforms.uPointer.value.set(pointerX, pointerZ);
        shader.uniforms.uIntro.value = Math.min(introElapsed / 2.3, 1);
        shader.uniforms.uScroll.value = scrollAmount;
      }

      points.rotation.y = Math.sin(elapsed * 0.08) * 0.018;
      points.position.y = -1.4 - scrollAmount * 0.72;
      material.opacity = 0.55 * (1 - scrollAmount * 0.68);
      mouseX += (targetX - mouseX) * 0.04;
      mouseY += (targetY - mouseY) * 0.04;
      camera.position.x = mouseX * 0.52;
      camera.position.y = 1.4 - mouseY * 0.32;
      camera.lookAt(0, -0.6, 0);
      renderer.render(scene, camera);
    };

    const syncAnimation = () => {
      if (!document.hidden && onScreen) {
        if (!frame) { clock.getDelta(); tick(); }
      } else if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    };

    window.addEventListener('resize', onResize);
    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    onVisibility = syncAnimation;
    document.addEventListener('visibilitychange', onVisibility);
    heroObserver = new IntersectionObserver((entries) => {
      onScreen = entries[0].isIntersecting;
      syncAnimation();
    });
    heroObserver.observe(host.parentElement);
    tick();
  };

  const syncScene = () => {
    if (!desktop.matches || reduceMotion.matches) {
      teardownScene();
      return;
    }
    loadThree().then(buildScene).catch(() => { noWebGL = true; });
  };

  initReveal();
  syncScene();
  desktop.addEventListener('change', syncScene);
  reduceMotion.addEventListener('change', syncScene);
  window.addEventListener('pagehide', teardownScene);
  window.addEventListener('pageshow', (event) => { if (event.persisted) syncScene(); });
})();
