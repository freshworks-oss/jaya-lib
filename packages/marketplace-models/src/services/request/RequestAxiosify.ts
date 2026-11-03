import { RequestProxy, RequestProxyOptions, RequestProxyResponse } from './Request';
import { AxiosResponse } from 'axios';

export enum Method {
  Delete = 'delete',
  Get = 'get',
  Patch = 'patch',
  Post = 'post',
  Put = 'put',
}

interface ParsedLocation {
  hash: string;
  host: string;
  hostname: string;
  href: string;
  pathname: string;
  port: string;
  protocol: string;
  search: string;
}

interface TemplateRequestProxy {
  invokeTemplate(templateName: string, options: Record<string, unknown>): Promise<RequestProxyResponse>;
}

type TemplateRequestOptions = { headers?: { Authorization?: string } } & Record<string, unknown>;

function getLocation(href: string): ParsedLocation | null {
  const match = href.match(/^(https?:)\/\/(([^:/?#]*)(?::([0-9]+))?)([/]{0,1}[^?#]*)(\?[^#]*|)(#.*|)$/);
  return (
    match && {
      hash: match[7],
      host: match[2],
      hostname: match[3],
      href,
      pathname: match[5],
      port: match[4],
      protocol: match[1],
      search: match[6],
    }
  );
}

const safelyParseJson = <T = unknown>(string: string): T => {
  try {
    return JSON.parse(string);
  } catch (e) {
    return string as unknown as T;
  }
};

const requestProxyFunc = async <T = unknown>(
  proxy: RequestProxy,
  method: Method,
  url: string,
  requestOptions: RequestProxyOptions,
): Promise<AxiosResponse<T>> => {
  const requestProxy = proxy as unknown as TemplateRequestProxy;
  const options = requestOptions as unknown as TemplateRequestOptions;

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
