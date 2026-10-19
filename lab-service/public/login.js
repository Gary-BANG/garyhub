'use strict';
location.replace(GaryHubAuth.loginUrl(new URLSearchParams(location.search).get('next')||(location.hostname==='garyhub.uk'?'/':'/lab/'),location.origin));
