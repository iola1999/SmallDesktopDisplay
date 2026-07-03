# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS build
WORKDIR /app

ARG MAPLE_MONO_VERSION=v7.9
ARG MAPLE_MONO_NF_CN_SHA256=af913b6322905348b3f50e4397fedc35b3a880db5effcce7969003051dcd3e94
ARG LXGW_WENKAI_SCREEN_VERSION=v1.522
ARG LXGW_WENKAI_SCREEN_SHA256=cd1a6fa39c4ea42fd8f4e289945789b0e510cf7016435640f8893cdad9b220f3

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl fonts-dejavu-core fonts-noto-cjk fonts-noto-color-emoji unzip \
    && curl -fsSL "https://github.com/subframe7536/maple-font/releases/download/${MAPLE_MONO_VERSION}/MapleMono-NF-CN.zip" -o /tmp/maple-mono-nf-cn.zip \
    && echo "${MAPLE_MONO_NF_CN_SHA256}  /tmp/maple-mono-nf-cn.zip" | sha256sum -c - \
    && mkdir -p /tmp/maple-mono-nf-cn /usr/local/share/fonts/maple-mono-nf-cn \
    && unzip -q /tmp/maple-mono-nf-cn.zip -d /tmp/maple-mono-nf-cn \
    && font_path="$(find /tmp/maple-mono-nf-cn -name MapleMono-NF-CN-Regular.ttf -print -quit)" \
    && test -n "$font_path" \
    && cp "$font_path" /usr/local/share/fonts/maple-mono-nf-cn/MapleMono-NF-CN-Regular.ttf \
    && mkdir -p /usr/local/share/fonts/lxgw-wenkai-screen \
    && curl -fsSL "https://github.com/lxgw/LxgwWenKai-Screen/releases/download/${LXGW_WENKAI_SCREEN_VERSION}/LXGWWenKaiScreen.ttf" -o /usr/local/share/fonts/lxgw-wenkai-screen/LXGWWenKaiScreen.ttf \
    && echo "${LXGW_WENKAI_SCREEN_SHA256}  /usr/local/share/fonts/lxgw-wenkai-screen/LXGWWenKaiScreen.ttf" | sha256sum -c - \
    && rm -rf /tmp/maple-mono-nf-cn /tmp/maple-mono-nf-cn.zip \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json tsconfig.json ./
COPY src ./src

RUN --mount=type=cache,target=/root/.npm npm ci \
    && npm run build \
    && npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /usr/share/fonts /usr/share/fonts
COPY --from=build /usr/local/share/fonts /usr/local/share/fonts
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

EXPOSE 8080

CMD ["node", "dist/main.js"]
