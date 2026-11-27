# Studio (website + API) for a hosted copy, e.g. https://www.tpdocgenai.com/benchmarkingStudio.
# Runners never run here: they need the logged-in Chrome on an office PC and call this Studio over HTTPS.
#   docker build --platform linux/amd64 -t benchmarking-studio .
# The website uses relative paths (any prefix works); the server strips BASE_PATH, which the load balancer passes on.
# Needs at run time: RUNNER_TOKEN, STUDIO_PASSWORD, ANTHROPIC_API_KEY (and optionally GEMINI_API_KEY); data in /app/studio/data.
# sop/past-searches.json and sop/prowess-product-groups.json are copied in when present on the building PC (Prowess
# plans need the second one).
ARG BASE_PATH=/benchmarkingStudio

FROM node:24-slim AS web
WORKDIR /app/studio/web
COPY studio/web/package.json studio/web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY studio/web/ ./
RUN npm run build

FROM node:24-slim
ARG BASE_PATH
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 BASE_PATH=$BASE_PATH EXPORTS_ON_RUNNER=1
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY planner/ planner/
COPY studio/api/ studio/api/
COPY studio/shared/ studio/shared/
COPY sop/ sop/
COPY --from=web /app/studio/web/dist studio/web/dist
RUN mkdir -p studio/data && chown node:node studio/data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD node -e "fetch('http://127.0.0.1:3000'+(process.env.BASE_PATH||'')+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "studio/api/server.mjs"]
