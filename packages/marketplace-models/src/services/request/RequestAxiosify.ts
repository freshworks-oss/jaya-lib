import { RequestProxy, RequestProxyOptions } from './Request';
import { AxiosResponse } from 'axios';

export enum Method {
  Delete = 'delete',
  Get = 'get',
  Patch = 'patch',
  Post = 'post',
  Put = 'put',
}

function getLocation(href:string) : any {
  var match = href.match(/^(https?\:)\/\/(([^:\/?#]*)(?:\:([0-9]+))?)([\/]{0,1}[^?#]*)(\?[^#]*|)(#.*|)$/);
  return match && {
      href: href,
      protocol: match[1],
      host: match[2],
      hostname: match[3],
      port: match[4],
      pathname: match[5],
      search: match[6],
      hash: match[7]
  }
}

const safelyParseJson = <T = unknown>(string: string): T => {
  try {
    return JSON.parse(string);
  } catch (e) {
    return string as unknown as T;
  }
};

const requestProxyFunc = async <T = unknown>(
  requestProxy: any,
  method: Method,
  url: string,
  options: any,
): Promise<AxiosResponse<T>> => {
  try {
    let urlObj = getLocation(url);

    const data = await requestProxy.invokeTemplate(`${method.toLowerCase()}BaseTemplate`, {
      context: {
        host: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        auth: options.headers?.Authorization,
      },
      ...options,
    });

    return {
      data: safelyParseJson<T>(data.response),
      headers: data.headers,
      status: data.status,
    } as unknown as AxiosResponse;  
  } catch (error) {
    // Consider logging the error or handling it as needed
    throw error;
  }
};

const requestAxiosify: {
  [key in Method]: <T = unknown>(
    requestProxy: RequestProxy,
    url: string,
    options: RequestProxyOptions,
  ) => Promise<AxiosResponse<T>>;
} = {
  [Method.Delete]: <T = unknown>(requestProxy: RequestProxy, url: string, options: RequestProxyOptions) =>
    requestProxyFunc<T>(requestProxy, Method.Delete, url, options),
  [Method.Get]: <T = unknown>(requestProxy: RequestProxy, url: string, options: RequestProxyOptions) =>
    requestProxyFunc<T>(requestProxy, Method.Get, url, options),
  [Method.Patch]: <T = unknown>(requestProxy: RequestProxy, url: string, options: RequestProxyOptions) =>
    requestProxyFunc<T>(requestProxy, Method.Patch, url, options),
  [Method.Post]: <T = unknown>(requestProxy: RequestProxy, url: string, options: RequestProxyOptions) =>
    requestProxyFunc<T>(requestProxy, Method.Post, url, options),
  [Method.Put]: <T = unknown>(requestProxy: RequestProxy, url: string, options: RequestProxyOptions) =>
    requestProxyFunc<T>(requestProxy, Method.Put, url, options),
};

export { requestAxiosify };
