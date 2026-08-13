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
    if (onMove) window.removeEventListener('mousemove', onMove);
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
      compiled.vertexShader = `uniform float uTime;\n${compiled.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n\ttransformed.y = sin(transformed.x * 0.7 + uTime * 0.35) * 0.13 + cos(transformed.z * 0.6 + uTime * 0.25) * 0.13;'
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
    let onScreen = true;
    let elapsed = 0;
    const clock = new THREE.Clock();

    onResize = () => {
      if (!desktop.matches || reduceMotion.matches) return;
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
    };
    onMove = (event) => {
      targetX = event.clientX / window.innerWidth - 0.5;
      targetY = event.clientY / window.innerHeight - 0.5;
    };

    const tick = () => {
      frame = requestAnimationFrame(tick);
      elapsed += clock.getDelta();
      if (shader) shader.uniforms.uTime.value = elapsed;
      points.rotation.y = elapsed * 0.018;
      mouseX += (targetX - mouseX) * 0.04;
      mouseY += (targetY - mouseY) * 0.04;
      camera.position.x = mouseX * 0.9;
      camera.position.y = 1.4 - mouseY * 0.5;
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
    window.addEventListener('mousemove', onMove);
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
