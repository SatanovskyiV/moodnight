import coreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

import base from "../../eslint.config.mjs";

const config = [...base, ...coreWebVitals, ...nextTypescript];

export default config;
