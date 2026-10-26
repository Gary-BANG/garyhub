// Research's unchanged feature marker remains 1.4.2.0; service health is checked
// separately against 1.4.3.0 by useful-http.cjs.
process.env.CHECK_VERSION='1.4.2.0';require('./research-http.cjs');
