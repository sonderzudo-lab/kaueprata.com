# kaueprata.com

Meu site pessoal. Uma página só, em HTML, CSS e JavaScript puros: sem
framework, sem build, sem `package.json`. Publicado na Vercel.

## Como rodar

Não tem passo de build. Qualquer servidor estático serve o diretório:

```bash
python -m http.server 8123
```

Abrir `http://localhost:8123`. Editar o arquivo e recarregar.

## Estrutura

```
index.html       a página em inglês
pt/index.html    a página em português
404.html         página de erro, no mesmo desenho
assets/site.css  estilo, compartilhado pelas três
assets/site.js   reveal no scroll e cena do hero
assets/          foto, card de Open Graph e ícones
vercel.json      headers de segurança e cache
tools/           gerador dos assets
```

## Assets

Foto, card de Open Graph, favicon e ícone do iOS são gerados, não editados
à mão. A partir de `tools/profile-source.jpg`:

```bash
python tools/build-assets.py
```

Trocar o accent significa mexer em **três** lugares: `index.html`,
`404.html` e `tools/build-assets.py` (que repinta o favicon e o card).

O card de OG usa fontes do sistema, porque Space Grotesk e JetBrains Mono
só existem no site via CDN. Ele não bate com a tipografia da página.

## Decisões

**Cada idioma tem endereço.** `/` em inglês, `/pt/` em português, as duas
estáticas e completas, com `hreflang` cruzado. Antes o português só existia
dentro de um objeto JavaScript: não dava para mandar um link em português
para ninguém, e o Google só indexava a versão inglesa. Como cada página já
nasce no seu idioma, não sobrou nenhuma tradução em tempo de execução.

**Só a raiz redireciona.** Quem chega em `/` sem preferência salva cai no
idioma do navegador. `/pt/` nunca redireciona, senão um link em português
não abriria em português para quem tem o navegador em inglês. A escolha
feita no botão fica no `localStorage` e passa a ter prioridade.

**A cena 3D é opcional por design.** O grid de partículas do topo não
inicializa abaixo de 768px de largura nem com `prefers-reduced-motion`
ligado, e pausa o `requestAnimationFrame` quando a aba perde o foco ou o
topo sai da tela. A onda é separável, então são 180 senos por frame em vez
de 16.200 para os 8.100 pontos.

**Dependências por CDN.** Three.js r128 pelo cdnjs, com `integrity`, e as
duas fontes pelo Google Fonts.

## Licença

O código está sob a licença MIT, em [LICENSE](LICENSE). A foto de perfil e
os textos sobre mim não estão incluídos: são meus e não são para reuso.
