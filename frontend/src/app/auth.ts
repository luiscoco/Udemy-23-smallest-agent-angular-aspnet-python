export interface PublicConfig {apiUrl:string;}
// Only the public .NET gateway is called by Angular; service credentials stay server-side.
export async function authorizedFetch(input:RequestInfo|URL,options?:RequestInit):Promise<Response>{return fetch(input,{...options,credentials:'same-origin'});}
