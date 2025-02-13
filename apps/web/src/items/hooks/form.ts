import { useRouter } from "next/router"
import { Routes } from "@blitzjs/next"
import { invoke, useQuery } from "@blitzjs/rpc"
import createItem from "../mutations/createItem"
import updateItem from "../mutations/updateItem"
import getItem from "../queries/getItem"
import getItems from "../queries/getItems"
import { ItemSchema } from "../validations"
import { match } from "ts-pattern"
import { constant, pipe } from "fp-ts/function"
import * as TE from "fp-ts/TaskEither"
import * as T from "fp-ts/Task"
import { none, some } from "fp-ts/Option"
import { fpInvalidateQuery, fpSetQueryData } from "src/core/helpers/blitz"
import getCurrentVenueCategories from "src/categories/queries/getCurrentVenueCategories"

const invalidateQueries = T.sequenceArray([
  fpInvalidateQuery(getItems),
  fpInvalidateQuery(getCurrentVenueCategories, {}),
])

const useCreate = (redirect = false) =>
  pipe(
    {
      redirect,
      router: useRouter(),
    },
    ({ redirect, router }) =>
      (data: ItemSchema) =>
        pipe(
          () => invoke(createItem, data),
          TE.chainFirstTaskK(() => () => fetch("/api/revalidate-current")),
          TE.chainFirstTaskK((item) =>
            fpSetQueryData(getItem, { identifier: item.identifier }, item)
          ),
          TE.chainFirstIOK(({ identifier }) => () => {
            if (redirect) router.push(Routes.AdminItemsItem({ identifier }))
          }),
          TE.chainFirstTaskK(() => invalidateQueries),
          TE.mapLeft((e) =>
            match(e)
              .with({ tag: "prismaNotFoundError" }, constant("this should not happen.. :("))
              .with({ tag: "prismaValidationError" }, ({ error }) => error.message)
              .exhaustive()
          )
        ),
    (onSubmit) => ({ onSubmit, item: none })
  )

const useUpdate = (identifier: string) => {
  const router = useRouter()
  const [item, { setQueryData }] = useQuery(getItem, { identifier })

  const onSubmit = (data: ItemSchema) =>
    pipe(
      () => invoke(updateItem, { id: item.id, ...data }),
      T.chainFirst(() => () => fetch("/api/revalidate-current")),
      T.chainFirst(() => invalidateQueries),
      T.chainFirst((it) => () => setQueryData(it)),
      T.chainFirst(({ identifier }) =>
        item.identifier === identifier
          ? T.of(true)
          : () => router.push(Routes.AdminItemsItem({ identifier }))
      ),
      TE.fromTask,
      TE.mapLeft(() => "Something happened while updating item!")
    )

  return { onSubmit, item: some(item) }
}

export const item = {
  useCreate,
  useUpdate,
}
