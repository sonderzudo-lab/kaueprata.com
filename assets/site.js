(() => {
  'use strict';

  const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));

  // guarda o idioma escolhido pra raiz saber pra onde mandar na proxima visita
  $$('a.lang-btn').forEach((link) => {
    link.addEventListener('click', () => {
      try { localStorage.setItem('kp-lang', link.dataset.lang); } catch (e) {}
    });
  });

  // reveal: 80ms de atraso entre irmaos, e para de observar quem ja apareceu
  let io = null;
  let pendentes = 0;

  const initReveal = () => {
    io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('rv-on');
        io.unobserve(entry.target);
        pendentes -= 1;
        if (pendentes === 0) { io.disconnect(); io = null; } // tudo apareceu
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    const vh = window.innerHeight || 800;
    $$('[data-reveal]').forEach((node) => {
      const siblings = Array.from(node.parentElement.children)
        .filter((c) => c.hasAttribute('data-reveal'));
      const i = siblings.indexOf(node);
      if (i > 0) node.style.transitionDelay = (i * 80) + 'ms';
      const box = node.getBoundingClientRect();
      if (box.top < vh && box.bottom > 0) node.classList.add('rv-on');
      else { pendentes += 1; io.observe(node); }
    });
    if (pendentes === 0 && io) { io.disconnect(); io = null; }
  };

  // cena 3d do hero: grid de particulas
  let built = false;
  let semWebgl = false;
  let raf = 0;
  let waitTimer = 0;
  let tries = 0;
  let renderer = null;
  let geo = null;
  let mat = null;
  let onMove = null;
  let onResize = null;
  let onVisibility = null;
  let heroIO = null;

  // estatico: desenha um quadro so e para. e o que roda com
  // prefers-reduced-motion, que pede menos movimento e nao menos conteudo
  const buildScene = (host, estatico) => {
    const THREE = window.THREE;
    const w = host.clientWidth, h = host.clientHeight;
    const pequeno = window.innerWidth < 768;

    // gpu na blocklist do chrome, driver velho ou aceleracao por hardware
    // desligada: o construtor estoura. a pagina segue sem a cena, sem insistir
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    } catch (e) {
      semWebgl = true;
      return;
    }
    built = true;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, pequeno ? 1.25 : 1.5));
    renderer.setSize(w, h);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 100);
    camera.position.set(0, 1.4, 6);

    // no celular o grid cai pra 48x48, um quarto dos pontos. a area coberta
    // continua a mesma, entao a malha so fica mais esparsa
    const N = pequeno ? 48 : 90, S = 20, pos = new Float32Array(N * N * 3);
    let k = 0;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      pos[k++] = (i / (N - 1) - 0.5) * S; pos[k++] = 0; pos[k++] = (j / (N - 1) - 0.5) * S;
    }
    geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); // estatico
    mat = new THREE.PointsMaterial({ color: 0x9a9a9e, size: 0.022, transparent: true, opacity: 0.55, sizeAttenuation: true });

    // a onda e calculada no vertex shader. em vez de escrever um material
    // do zero, injeta a deformacao no shader que o three ja monta, pra nao
    // mexer no calculo de tamanho do ponto. por frame sobe um float, e nao
    // os 97 KB de vertice que a versao em cpu reenviava
    let shader = null;
    mat.onBeforeCompile = (s) => {
      s.uniforms.uTime = { value: 0 };
      s.vertexShader = 'uniform float uTime;\n' + s.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n\ttransformed.y = sin(transformed.x * 0.7 + uTime * 0.35) * 0.13 + cos(transformed.z * 0.6 + uTime * 0.25) * 0.13;'
      );
      shader = s;
    };

    const pts = new THREE.Points(geo, mat);
    pts.position.y = -1.4;
    scene.add(pts);

    let mx = 0, my = 0, tx = 0, ty = 0;

    const desenhaUm = () => {
      camera.lookAt(0, -0.6, 0);
      renderer.render(scene, camera);
    };

    onResize = () => {
      const w2 = host.clientWidth, h2 = host.clientHeight;
      camera.aspect = w2 / h2; camera.updateProjectionMatrix(); renderer.setSize(w2, h2);
      if (estatico) desenhaUm();
    };
    window.addEventListener('resize', onResize);

    if (estatico) {
      desenhaUm();
      return; // sem raf, sem parallax, sem nada pra pausar depois
    }

    onMove = (e) => { tx = e.clientX / window.innerWidth - 0.5; ty = e.clientY / window.innerHeight - 0.5; };
    window.addEventListener('mousemove', onMove);

    const clock = new THREE.Clock();
    let t = 0;

    const tick = () => {
      raf = requestAnimationFrame(tick);
      t += clock.getDelta();
      if (shader) shader.uniforms.uTime.value = t; // respiracao: onda lenta e rasa
      pts.rotation.y = t * 0.018;
      mx += (tx - mx) * 0.04; my += (ty - my) * 0.04; // lerp, nunca direto
      camera.position.x = mx * 0.9;
      camera.position.y = 1.4 - my * 0.5;
      camera.lookAt(0, -0.6, 0);
      renderer.render(scene, camera);
    };
    tick();

    // so anima com a aba em foco e o hero na tela. sem isso a cena continua
    // gastando frame atras do conteudo enquanto voce rola a pagina
    let onScreen = true;
    const sync = () => {
      if (!document.hidden && onScreen) {
        if (!raf) {
          clock.getDelta(); // descarta o tempo parado pra onda nao pular
          tick();
        }
      } else if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };

    onVisibility = sync;
    document.addEventListener('visibilitychange', onVisibility);

    heroIO = new IntersectionObserver((entries) => {
      onScreen = entries[0].isIntersecting;
      sync();
    }, { threshold: 0 });
    heroIO.observe(host.parentElement);
  };

  const calmo = window.matchMedia('(prefers-reduced-motion: reduce)');

  // o gate volta a ser testado no resize porque no primeiro frame a viewport
  // pode vir com 0 de largura, e a cena precisa de tamanho pra montar
  const init3D = () => {
    if (built || semWebgl) return;
    const host = document.getElementById('hero-canvas');
    if (!host) return;
    if (window.THREE && host.clientWidth && host.clientHeight) {
      buildScene(host, calmo.matches);
      return;
    }
    if (tries++ < 50) {
      clearTimeout(waitTimer);
      waitTimer = setTimeout(init3D, 120);
    }
  };

  // tambem serve pra reconstruir a cena noutro modo, entao o listener que
  // chama o init3D fica de fora: sem ele nao haveria como remontar depois
  const teardown3D = () => {
    if (waitTimer) clearTimeout(waitTimer);
    if (raf) cancelAnimationFrame(raf);
    if (onMove) window.removeEventListener('mousemove', onMove);
    if (onResize) window.removeEventListener('resize', onResize);
    if (onVisibility) document.removeEventListener('visibilitychange', onVisibility);
    if (heroIO) heroIO.disconnect();
    if (renderer) {
      renderer.domElement.remove();
      renderer.dispose(); geo.dispose(); mat.dispose();
    }
    built = false; raf = 0; tries = 0; renderer = null;
    onMove = null; onResize = null; onVisibility = null; heroIO = null;
  };

  initReveal();
  init3D();
  window.addEventListener('resize', init3D);

  // o css ja obedece a media query sozinho; aqui a cena precisa ser remontada
  // no outro modo: animada, ou um quadro parado
  calmo.addEventListener('change', () => { teardown3D(); init3D(); });

  // pagehide tambem dispara ao entrar no bfcache, entao voltar pelo botao
  // voltar devolvia um hero morto. o pageshow remonta a cena
  window.addEventListener('pagehide', teardown3D);
  window.addEventListener('pageshow', (e) => { if (e.persisted) init3D(); });
})();
