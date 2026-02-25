import fetch from 'node-fetch';

const response = fetch('https://github.com/');
const body = await response.text();

console.log(body);