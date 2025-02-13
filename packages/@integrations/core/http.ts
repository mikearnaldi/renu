import * as Layer from "@effect/io/Layer"
import * as Effect from "@effect/io/Effect"
import * as Context from "@fp-ts/data/Context"
import { taggedError, InferError } from "shared/errors"
import { TaggedError } from "shared/errors"
import { Json } from "@fp-ts/data/Json"
import { pipe } from "@fp-ts/data/Function"

interface HttpConfigService {
  baseUrl: string
  headers: HeadersInit
}
export const HttpConfigService = Context.Tag<HttpConfigService>()

export interface HttpService {
  request: HttpRequest
}
export const HttpService = Context.Tag<HttpService>()

export type HttpRequest = (
  input: RequestInfo | URL,
  init?: RequestInit | undefined
) => Effect.Effect<
  HttpConfigService,
  TaggedError<"HttpRequestError" | "HttpNotFoundError">,
  Response
>

export const httpRequestError = taggedError("HttpRequestError")
export type HttpRequestError = InferError<typeof httpRequestError>

export const httpNotFoundError = taggedError("HttpNotFoundError")
export type HttpNotFoundError = InferError<typeof httpNotFoundError>

export const HttpServiceWithEffect = Effect.serviceWithEffect(HttpService)
export const HttpConfigWith = Effect.serviceWith(HttpConfigService)

export const request = (...args: Parameters<HttpRequest>) =>
  HttpServiceWithEffect((s) => s.request(...args))

export const HttpFetchService = HttpConfigWith(
  (c): HttpService => ({
    request: (input: RequestInfo | URL, init?: RequestInit | undefined) =>
      pipe(
        Effect.tryCatchPromiseInterrupt((signal) => {
          const req = new Request(
            input instanceof Request ? input.clone() : new Request(new URL(input, c.baseUrl)),
            { ...init, signal }
          )

          for (const [key, value] of new Headers(c.headers).entries()) {
            req.headers.append(key, value)
          }

          return fetch(req)
        }, httpRequestError),
        Effect.flatMap((res) =>
          res.status === 404 ? Effect.fail(httpNotFoundError(res)) : Effect.succeed(res)
        )
      ),
  })
)

export const toJson = (res: Response) =>
  Effect.tryCatchPromise(() => res.json() as Promise<Json>, taggedError("JsonParseError"))

export const Layers = {
  HttpFetchLayer: Layer.fromEffect(HttpService)(HttpFetchService),
}
