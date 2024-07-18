FROM node:18-slim as ts-compiler
ARG DISCORD_API_KEY
ARG OPENAI_ORGANIZATION_ID
ARG OPENAI_API_KEY
ARG MODEL_NAME

WORKDIR /usr/app

ENV DISCORD_API_KEY=$DISCORD_API_KEY
ENV OPENAI_ORGANIZATION_ID=$OPENAI_ORGANIZATION_ID
ENV OPENAI_API_KEY=$OPENAI_API_KEY
ENV MODEL_NAME=$MODEL_NAME

COPY yarn.lock ./
COPY package*.json ./
COPY tsconfig*.json ./
RUN yarn install
COPY . ./
RUN yarn run build

FROM node:18-slim as ts-remover
WORKDIR /usr/app
COPY --from=ts-compiler /usr/app/yarn.lock ./
COPY --from=ts-compiler /usr/app/package*.json ./
COPY --from=ts-compiler /usr/app/dist ./
ENV NODE_ENV=production
RUN yarn install

FROM node:18-slim
WORKDIR /usr/app
COPY --from=ts-remover /usr/app ./
CMD node index.js