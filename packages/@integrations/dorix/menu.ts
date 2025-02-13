import * as A from "@fp-ts/data/ReadonlyArray"
import * as O from "@fp-ts/data/Option"
import { pipe } from "@fp-ts/data/Function"
import * as S from "@fp-ts/schema/Schema"
import * as C from "@fp-ts/schema/Codec"
import * as D from "@fp-ts/schema/Decoder"
import {
  ManagementCategory,
  ManagementItem,
  ManagementMenu,
  ManagementModifier,
  ManagementModifierOption,
} from "@integrations/core/management"

const MangledNumberish = pipe(S.union(S.string, S.number), S.optional)

const DorixPrice = S.struct({
  inplace: MangledNumberish,
  ta: MangledNumberish,
  delivery: MangledNumberish,
  pickup: MangledNumberish,
})

const DorixAnswer = S.struct({
  id: S.string,
  name: S.string,
  price: pipe(DorixPrice, S.partial, S.optional),
})

const DorixQuestion = S.struct({
  name: S.string,
  mandatory: S.boolean,
  answerLimit: pipe(
    D.make(S.number, (i) => D.success(Number(i))),
    S.nonNaN
  ),
  items: S.array(DorixAnswer),
})

export const DorixItem = S.struct({
  _id: S.string,
  price: pipe(DorixPrice, S.partial, S.optional),
  name: S.string,
  description: D.make(pipe(S.string, S.optional), (a) => D.success(String(a ?? ""))),
  questions: pipe(
    S.struct({
      mandatory: S.array(
        pipe(DorixQuestion, S.extend(S.field("mandatory", C.literal(true), false)))
      ),
      optional: C.array(
        pipe(DorixQuestion, S.extend(S.field("mandatory", C.literal(false), false)))
      ),
    }),
    S.optional
  ),
})

type DorixItem = C.Infer<typeof DorixItem>

type DorixItemWithQuestions = S.Spread<
  Omit<Required<DorixItem>, "price"> & Pick<DorixItem, "price">
>

export const DorixCategory = S.struct({
  _id: S.string,
  name: S.string,
  items: S.array(DorixItem),
})
export const DorixMenu = S.struct({
  _id: S.string,
  name: S.string,
  items: S.array(DorixCategory),
})
export type DorixMenu = S.Infer<typeof DorixMenu>
export const DorixMenuDecoder = D.decoderFor(DorixMenu)

export const MenuResponse = S.union(
  S.struct({ ack: S.literal(true), data: S.struct({ menu: DorixMenu }) }),
  S.struct({ ack: S.literal(false), message: pipe(S.string, S.optional) })
)

export const MenuResponseDecoder = D.decoderFor(MenuResponse)

export const toMenu = (dorix: DorixMenu): ManagementMenu => ({
  id: dorix._id,
  name: dorix.name,
  categories: pipe(
    dorix.items,
    A.map(
      (c): ManagementCategory => ({
        id: c._id,
        name: c.name,
        items: pipe(
          c.items,
          A.filter(
            (i): i is DorixItemWithQuestions =>
              Array.isArray(i.questions?.optional) || Array.isArray(i.questions?.mandatory)
          ),
          A.map(
            (i): ManagementItem => ({
              id: i._id,
              name: i.name,
              description: i.description,
              price: Number(i.price?.inplace ?? 0),
              modifiers: pipe(
                i.questions.mandatory,
                A.union(i.questions.optional),
                A.map(
                  (m): ManagementModifier => ({
                    name: m.name,
                    max: m.answerLimit,
                    min: m.mandatory ? 1 : undefined,
                    options: pipe(
                      m.items,
                      A.map(
                        (o): ManagementModifierOption => ({
                          id: o.id,
                          name: o.name,
                          price: pipe(
                            O.fromNullable(o.price?.inplace),
                            O.map(Number),
                            O.flatMap((n) => (Number.isNaN(n) ? O.none : O.some(n))),
                            O.getOrUndefined
                          ),
                        })
                      )
                    ),
                  })
                )
              ),
            })
          )
        ),
      })
    )
  ),
})
