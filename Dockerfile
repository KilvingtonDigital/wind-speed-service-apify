FROM apify/actor-node-puppeteer-chrome:18

COPY package*.json ./

RUN npm install --omit=dev --omit=optional \
    && echo "Installed NPM packages:" \
    && npm list --omit=dev --omit=optional \
    && rm -r ~/.npm

COPY . ./

CMD npm start
