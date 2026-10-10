# finch-ui

Interface web do Finch, um sistema de controle financeiro. É só a camada de apresentação: os dados e as regras ficam em uma API separada.

React 19 + TypeScript, Vite, `react-router-dom` (`HashRouter`) e CSS próprio.

## Rodando localmente

Pré-requisitos: [Node.js](https://nodejs.org) 24 (LTS) e a API rodando.

```
npm install
npm run dev
```

A aplicação abre em http://localhost:5173. O endereço da API vem de `VITE_API_URL` (padrão `http://localhost:8080`); para mudar, copie `.env.example` para `.env`.

## Testes, build e lint

```
npm test
npm run build
npm run lint
```

## Publicação

No GitHub Pages, pelo workflow `.github/workflows/deploy.yml` (roda os testes, faz o build e publica a cada push na `main` ou `master`).

1. Em **Settings → Pages**, escolha **GitHub Actions** como fonte.
2. Em **Settings → Secrets and variables → Actions → Variables**, crie a variável `VITE_API_URL` com a URL pública da API, sem barra no fim.
3. Na API, a variável `CORS_ORIGINS` precisa ter a origem do Pages (`https://<usuário>.github.io`).

O repositório precisa ser público para o Pages gratuito.
