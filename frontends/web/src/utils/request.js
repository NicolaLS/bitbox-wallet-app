import { extConfig } from './config';
import { call } from './qttransport';

export const apiPort = extConfig('{{ API_PORT }}', '8082');
export const apiToken = extConfig('{{ API_TOKEN }}', '');

export function isTLS() {
    return document.URL.startsWith('https://');
}

export function apiURL(endpoint) {
    return (isTLS() ? 'https://' : 'http://') + 'localhost:' + apiPort + '/api/' + endpoint;
}

function handleError(endpoint) {
    return function(json) {
        return new Promise((resolve, reject) => {
            if (json && json.error) {
                if (json.error.indexOf('hidapi: unknown failure') !== -1) {
                    // Ignore device communication errors. Usually
                    // happens when unplugged during an operation, in
                    // which case the result does not matter.
                    return;
                }
                console.log('error from endpoint', endpoint, json); // eslint-disable-line no-console
                alert(json.error + ' (todo: nice error msgs)'); // eslint-disable-line no-alert
                reject(json.error);
                return;
            }
            resolve(json);
        });
    };
}

export function apiGet(endpoint) {
    if (typeof qt !== 'undefined') {
        return call(JSON.stringify({
            method: 'GET',
            endpoint,
        }));
    }
    return fetch(apiURL(endpoint), {
        method: 'GET'
    }).then(r => r.json()).then(handleError(endpoint));
}

export function apiPost(endpoint, body) {
    if (typeof qt !== 'undefined') {
        return call(JSON.stringify({
            method: 'POST',
            endpoint,
            body: JSON.stringify(body)
        }));
    }
    return fetch(apiURL(endpoint), {
        method: 'POST',
        body: JSON.stringify(body)
    }).then(r => r.json()).then(handleError(endpoint));
}
