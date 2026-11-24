import { RequestProxy } from './Request';
import { AxiosResponse } from 'axios';

export enum Method {
  Delete = 'delete',
  Get = 'get',
  Patch = 'patch',
  Post = 'post',
  Put = 'put',
}

interface ParsedUrl {
  hash: string;
  host: string;
  hostname: string;
  href: string;
  pathname: string;
  port: string;
  protocol: string;
  search: string;
}

interface StaticIpRequestProxy {
  invokeTemplate(
    templateName: string,
    options: Record<string, unknown>,
  ): Promise<{
    headers: Record<string, string>;
    response: string;
    status: number;
  }>;
}

interface RequestProxyCallOptions {
  body?: string;
  headers?: Record<string, string>;
  maxAttempts?: number;
  retryDelay?: number;
  staticIP?: boolean;
}

function getLocation(href: string): ParsedUrl | null {
  const match = href.match(/^(https?\:)\/\/(([^:\/?#]*)(?:\:([0-9]+))?)([\/]{0,1}[^?#]*)(\?[^#]*|)(#.*|)$/);
  if (!match) {
    return null;
  }
  return {
    hash: match[7],
    host: match[2],
    hostname: match[3],
    href: href,
    pathname: match[5],
    port: match[4],
    protocol: match[1],
    search: match[6],
  };
}

const safelyParseJson = <T = unknown>(string: string): T => {
  try {
    return JSON.parse(string);
  } catch (e) {
    return string as unknown as T;
  }
};

const requestProxyFunc = async <T = unknown>(
  requestProxy: StaticIpRequestProxy,
  method: Method,
  url: string,
  options: RequestProxyCallOptions,
): Promise<AxiosResponse<T>> => {
  try {
    const urlObj = getLocation(url);
    if (!urlObj) {
      throw new Error(`Invalid URL: ${url}`);
    }

    const data = await requestProxy.invokeTemplate(`${method.toLowerCase()}BaseTemplate`, {
      context: {
        auth: options.headers?.Authorization,
        host: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
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
    options: RequestProxyCallOptions,
  ) => Promise<AxiosResponse<T>>;
} = {
  [Method.Delete]: <T = unknown>(requestProxy: RequestProxy, url: string, options: RequestProxyCallOptions) =>
    requestProxyFunc<T>(requestProxy as unknown as StaticIpRequestProxy, Method.Delete, url, options),
  [Method.Get]: <T = unknown>(requestProxy: RequestProxy, url: string, options: RequestProxyCallOptions) =>
    requestProxyFunc<T>(requestProxy as unknown as StaticIpRequestProxy, Method.Get, url, options),
  [Method.Patch]: <T = unknown>(requestProxy: RequestProxy, url: string, options: RequestProxyCallOptions) =>
    requestProxyFunc<T>(requestProxy as unknown as StaticIpRequestProxy, Method.Patch, url, options),
  [Method.Post]: <T = unknown>(requestProxy: RequestProxy, url: string, options: RequestProxyCallOptions) =>
    requestProxyFunc<T>(requestProxy as unknown as StaticIpRequestProxy, Method.Post, url, options),
  [Method.Put]: <T = unknown>(requestProxy: RequestProxy, url: string, options: RequestProxyCallOptions) =>
    requestProxyFunc<T>(requestProxy as unknown as StaticIpRequestProxy, Method.Put, url, options),
};

export { requestAxiosify };
