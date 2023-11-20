/* eslint-disable no-restricted-globals, no-restricted-syntax */

import {
  Environment,
  translateToNewGQLCollection,
  translateToNewRESTCollection,
} from "@hoppscotch/data"
import { watchDebounced } from "@vueuse/core"
import { TestContainer } from "dioc/testing"
import { cloneDeep } from "lodash-es"
import { afterAll, describe, expect, it, vi } from "vitest"

import { MQTTRequest$, setMQTTRequest } from "~/newstore/MQTTSession"
import { SSERequest$, setSSERequest } from "~/newstore/SSESession"
import { SIORequest$, setSIORequest } from "~/newstore/SocketIOSession"
import { WSRequest$, setWSRequest } from "~/newstore/WebSocketSession"
import {
  graphqlCollectionStore,
  restCollectionStore,
  setGraphqlCollections,
  setRESTCollections,
} from "~/newstore/collections"
import {
  addGlobalEnvVariable,
  environments$,
  globalEnv$,
  replaceEnvironments,
  selectedEnvironmentIndex$,
  setGlobalEnvVariables,
  setSelectedEnvironmentIndex,
} from "~/newstore/environments"
import {
  graphqlHistoryStore,
  restHistoryStore,
  setGraphqlHistoryEntries,
  setRESTHistoryEntries,
  translateToNewGQLHistory,
  translateToNewRESTHistory,
} from "~/newstore/history"
import { bulkApplyLocalState, localStateStore } from "~/newstore/localstate"
import {
  applySetting,
  bulkApplySettings,
  performSettingsDataMigrations,
  settingsStore,
} from "~/newstore/settings"
import { GQLTabService } from "~/services/tab/graphql"
import { RESTTabService } from "~/services/tab/rest"
import { PersistenceService } from "../../persistence"
import {
  ENVIRONMENTS,
  GQL_COLLECTIONS,
  GQL_HISTORY,
  GQL_TAB_STATE,
  REST_COLLECTIONS,
  REST_HISTORY,
  REST_TAB_STATE,
  VUEX_DATA,
} from "./__mocks__"

vi.mock("~/modules/i18n", () => {
  return {
    __esModule: true,
    getI18n: vi.fn().mockImplementation(() => () => "test"),
  }
})

// Define modules that are shared across methods here
vi.mock("@vueuse/core", async (importOriginal) => {
  const actualModule: Record<string, unknown> = await importOriginal()

  return {
    ...actualModule,
    watchDebounced: vi.fn(),
  }
})

vi.mock("~/newstore/environments", () => {
  return {
    addGlobalEnvVariable: vi.fn(),
    setGlobalEnvVariables: vi.fn(),
    replaceEnvironments: vi.fn(),
    setSelectedEnvironmentIndex: vi.fn(),
    environments$: {
      subscribe: vi.fn(),
    },
    globalEnv$: {
      subscribe: vi.fn(),
    },
    selectedEnvironmentIndex$: {
      subscribe: vi.fn(),
    },
  }
})

vi.mock("~/newstore/settings", () => {
  return {
    applySetting: vi.fn(),
  }
})

const toastErrorFn = vi.fn()

vi.mock("~/composables/toast", () => {
  return {
    useToast: () => ({ error: toastErrorFn }),
  }
})

/**
 * Helper functions
 */
const spyOnGetItem = () => vi.spyOn(Storage.prototype, "getItem")
const spyOnRemoveItem = () => vi.spyOn(Storage.prototype, "removeItem")
const spyOnSetItem = () => vi.spyOn(Storage.prototype, "setItem")

const bindPersistenceService = ({
  bindGQLTabService = false,
  bindRESTTabService = false,
  mocks = {},
}: {
  bindGQLTabService?: boolean
  bindRESTTabService?: boolean
  mocks?: Record<string, unknown>
} = {}) => {
  const container = new TestContainer()

  if (bindGQLTabService) {
    container.bindMock(GQLTabService, mocks)
  }

  if (bindRESTTabService) {
    container.bindMock(RESTTabService, mocks)
  }

  container.bind(PersistenceService)

  const service = container.bind(PersistenceService)
  return service
}

describe("PersistenceService", () => {
  afterAll(() => {
    // Clear all mocks
    vi.clearAllMocks()

    // Restore the original implementation for any spied functions
    vi.restoreAllMocks()
  })

  describe("Service initialisation", () => {
    describe("Check and migrate old settings", () => {
      // Set of keys read from localStorage across test cases
      const bgColorKey = "BG_COLOR"
      const nuxtColorModeKey = "nuxt-color-mode"
      const selectedEnvIndexKey = "selectedEnvIndex"
      const themeColorKey = "THEME_COLOR"
      const vuexKey = "vuex"

      it(`sets the selected environment index type as "NO_ENV" in localStorage if the value retrieved for ${selectedEnvIndexKey} is "-1"`, () => {
        window.localStorage.setItem(selectedEnvIndexKey, "-1")

        const getItemSpy = spyOnGetItem()
        const setItemSpy = spyOnSetItem()

        bindPersistenceService()

        expect(getItemSpy).toHaveBeenCalledWith(selectedEnvIndexKey)
        expect(setItemSpy).toHaveBeenCalledWith(
          selectedEnvIndexKey,
          JSON.stringify({
            type: "NO_ENV_SELECTED",
          })
        )
      })

      it(`sets the selected environment index type as "MY_ENV" in localStorage if the value retrieved for "${selectedEnvIndexKey}" is greater than "0"`, () => {
        window.localStorage.setItem(selectedEnvIndexKey, "1")

        const getItemSpy = spyOnGetItem()
        const setItemSpy = spyOnSetItem()

        bindPersistenceService()

        expect(getItemSpy).toHaveBeenCalledWith(selectedEnvIndexKey)
        expect(setItemSpy).toHaveBeenCalledWith(
          selectedEnvIndexKey,
          JSON.stringify({
            type: "MY_ENV",
            index: 1,
          })
        )
      })

      it(`skips schema parsing and setting other properties if ${vuexKey} read from localStorage is an empty entity`, () => {
        window.localStorage.setItem(vuexKey, JSON.stringify({}))

        const getItemSpy = spyOnGetItem()
        const setItemSpy = spyOnSetItem()

        bindPersistenceService()

        expect(getItemSpy).toHaveBeenCalledWith(vuexKey)

        expect(toastErrorFn).not.toHaveBeenCalled()
        expect(setItemSpy).not.toHaveBeenCalled()
      })

      it(`shows an error and sets the entry as a backup in localStorage if "${vuexKey}" read from localStorage doesn't match the schema`, () => {
        // Invalid shape for `vuex`
        // `postwoman.settings.CURRENT_INTERCEPTOR_ID` -> `string`
        const vuexData = {
          ...VUEX_DATA,
          postwoman: {
            ...VUEX_DATA.postwoman,
            settings: {
              ...VUEX_DATA.postwoman.settings,
              CURRENT_INTERCEPTOR_ID: 1234,
            },
          },
        }

        window.localStorage.setItem(vuexKey, JSON.stringify(vuexData))

        const getItemSpy = spyOnGetItem()
        const setItemSpy = spyOnSetItem()

        bindPersistenceService()

        expect(getItemSpy).toHaveBeenCalledWith(vuexKey)
        expect(toastErrorFn).toHaveBeenCalledWith(
          expect.stringContaining(vuexKey)
        )
        expect(setItemSpy).toHaveBeenCalledWith(
          `${vuexKey}-backup`,
          JSON.stringify(vuexData)
        )
      })

      it(`shows an error and sets the entry as a backup in localStorage if "${themeColorKey}" read from localStorage doesn't match the schema`, () => {
        const vuexData = cloneDeep(VUEX_DATA)
        window.localStorage.setItem(vuexKey, JSON.stringify(vuexData))

        const themeColorValue = "invalid-color"
        window.localStorage.setItem(themeColorKey, themeColorValue)

        const getItemSpy = spyOnGetItem()
        const removeItemSpy = spyOnRemoveItem()
        const setItemSpy = spyOnSetItem()

        bindPersistenceService()

        expect(getItemSpy).toHaveBeenCalledWith(vuexKey)

        expect(toastErrorFn).toHaveBeenCalledWith(
          expect.stringContaining(themeColorKey)
        )
        expect(setItemSpy).toHaveBeenCalledWith(
          `${themeColorKey}-backup`,
          themeColorValue
        )

        expect(applySetting).toHaveBeenCalledWith(
          themeColorKey,
          themeColorValue
        )
        expect(removeItemSpy).toHaveBeenCalledWith(themeColorKey)
      })

      it(`shows an error and sets the entry as a backup in localStorage if "${nuxtColorModeKey}" read from localStorage doesn't match the schema`, () => {
        const vuexData = cloneDeep(VUEX_DATA)
        window.localStorage.setItem(vuexKey, JSON.stringify(vuexData))

        const nuxtColorModeValue = "invalid-color"
        window.localStorage.setItem(nuxtColorModeKey, nuxtColorModeValue)

        const getItemSpy = spyOnGetItem()
        const removeItemSpy = spyOnRemoveItem()
        const setItemSpy = spyOnSetItem()

        bindPersistenceService()

        expect(getItemSpy).toHaveBeenCalledWith(vuexKey)

        expect(toastErrorFn).toHaveBeenCalledWith(
          expect.stringContaining(nuxtColorModeKey)
        )
        expect(setItemSpy).toHaveBeenCalledWith(
          `${nuxtColorModeKey}-backup`,
          nuxtColorModeValue
        )

        expect(applySetting).toHaveBeenCalledWith(
          bgColorKey,
          nuxtColorModeValue
        )
        expect(removeItemSpy).toHaveBeenCalledWith(nuxtColorModeKey)
      })

      it(`extracts individual properties from the key "${vuexKey}" and sets them in localStorage`, () => {
        const vuexData = cloneDeep(VUEX_DATA)
        window.localStorage.setItem(vuexKey, JSON.stringify(vuexData))

        const themeColor = "red"
        const nuxtColorMode = "dark"

        window.localStorage.setItem(themeColorKey, themeColor)
        window.localStorage.setItem(nuxtColorModeKey, nuxtColorMode)

        const getItemSpy = spyOnGetItem()
        const removeItemSpy = spyOnRemoveItem()
        const setItemSpy = spyOnSetItem()

        bindPersistenceService()

        expect(getItemSpy).toHaveBeenCalledWith(vuexKey)

        expect(toastErrorFn).not.toHaveBeenCalledWith(nuxtColorModeKey)
        expect(setItemSpy).not.toHaveBeenCalledWith(
          `${nuxtColorModeKey}-backup`
        )

        expect(setItemSpy).toHaveBeenCalledWith(
          "settings",
          JSON.stringify(vuexData.postwoman.settings)
        )

        const { postwoman } = vuexData
        delete postwoman.settings

        expect(setItemSpy).toHaveBeenCalledWith(
          vuexKey,
          JSON.stringify(vuexData)
        )

        // Excluding `settings`
        expect(setItemSpy).toHaveBeenCalledWith(
          "collections",
          JSON.stringify(postwoman.collections)
        )

        delete postwoman.collections

        // Excluding `settings` & `collections`
        expect(setItemSpy).toHaveBeenCalledWith(
          vuexKey,
          JSON.stringify(vuexData)
        )

        expect(setItemSpy).toHaveBeenCalledWith(
          "collectionsGraphql",
          JSON.stringify(postwoman.collectionsGraphql)
        )

        delete postwoman.collectionsGraphql

        // Excluding `settings, `collections` & `collectionsGraphql`
        expect(setItemSpy).toHaveBeenCalledWith(
          vuexKey,
          JSON.stringify(vuexData)
        )

        expect(setItemSpy).toHaveBeenCalledWith(
          "environments",
          JSON.stringify(postwoman.environments)
        )

        delete postwoman.environments

        // Excluding `settings, `collections`, `collectionsGraphql` & `environments`
        expect(setItemSpy).toHaveBeenCalledWith(
          vuexKey,
          JSON.stringify(vuexData)
        )

        expect(getItemSpy).toHaveBeenCalledWith(themeColorKey)
        expect(applySetting).toHaveBeenCalledWith(themeColorKey, themeColor)
        expect(removeItemSpy).toHaveBeenCalledWith(themeColorKey)
        expect(window.localStorage.getItem(themeColorKey)).toBe(null)

        expect(getItemSpy).toHaveBeenCalledWith(nuxtColorModeKey)
        expect(applySetting).toHaveBeenCalledWith(bgColorKey, nuxtColorMode)
        expect(removeItemSpy).toHaveBeenCalledWith(nuxtColorModeKey)
        expect(window.localStorage.getItem(nuxtColorModeKey)).toBe(null)
      })
    })

    describe("Setup local state persistence", () => {
      // Key read from localStorage across test cases
      const localStateKey = "localState"

      it(`shows an error and sets the entry as a backup in localStorage if "${localStateKey}" read from localStorage has a value which is not a "string" or "undefined"`, () => {
        const localStateData = {
          REMEMBERED_TEAM_ID: null,
        }
        window.localStorage.setItem(
          localStateKey,
          JSON.stringify(localStateData)
        )

        const getItemSpy = spyOnGetItem()
        const setItemSpy = spyOnSetItem()

        bindPersistenceService()

        expect(getItemSpy).toHaveBeenCalledWith(localStateKey)

        expect(toastErrorFn).toHaveBeenCalledWith(
          expect.stringContaining(localStateKey)
        )
        expect(setItemSpy).toHaveBeenCalledWith(
          `${localStateKey}-backup`,
          JSON.stringify(localStateData)
        )
      })

      it(`shows an error and sets the entry as a backup in localStorage if "${localStateKey}" read from localStorage has an invalid key`, () => {
        const localStateData = {
          INVALID_KEY: null,
        }
        window.localStorage.setItem(
          localStateKey,
          JSON.stringify(localStateData)
        )

        const getItemSpy = spyOnGetItem()
        const setItemSpy = spyOnSetItem()

        bindPersistenceService()

        expect(getItemSpy).toHaveBeenCalledWith(localStateKey)

        expect(toastErrorFn).toHaveBeenCalledWith(
          expect.stringContaining(localStateKey)
        )
        expect(setItemSpy).toHaveBeenCalledWith(
          `${localStateKey}-backup`,
          JSON.stringify(localStateData)
        )
      })

      it(`schema parsing succeeds if there is no "${localStateKey}" key present in localStorage where the fallback of "{}" is chosen`, () => {
        window.localStorage.removeItem(localStateKey)

        const getItemSpy = spyOnGetItem()
        const setItemSpy = spyOnSetItem()

        bindPersistenceService()

        expect(getItemSpy).toHaveBeenCalledWith(localStateKey)

        expect(toastErrorFn).not.toHaveBeenCalledWith(localStateKey)
        expect(setItemSpy).not.toHaveBeenCalled()
      })

      it(`reads the value for "${localStateKey}" key from localStorage, invokes "bulkApplyLocalState" function if a value is yielded and subscribes to "localStateStore" updates`, () => {
        vi.mock("~/newstore/localstate", () => {
          return {
            bulkApplyLocalState: vi.fn(),
            localStateStore: {
              subject$: {
                subscribe: vi.fn(),
              },
            },
          }
        })

        const localStateData = {
          REMEMBERED_TEAM_ID: "test-id",
        }
        window.localStorage.setItem(
          localStateKey,
          JSON.stringify(localStateData)
        )

        const getItemSpy = spyOnGetItem()
        const setItemSpy = spyOnSetItem()

        bindPersistenceService()

        expect(getItemSpy).toHaveBeenCalledWith(localStateKey)

        expect(toastErrorFn).not.toHaveBeenCalledWith(localStateKey)
        expect(setItemSpy).not.toHaveBeenCalled()

        expect(bulkApplyLocalState).toHaveBeenCalledWith(localStateData)
        expect(localStateStore.subject$.subscribe).toHaveBeenCalledWith(
          expect.any(Function)
        )
      })
    })

    describe("Setup settings persistence", () => {
      // Key read from localStorage across test cases
      const settingsKey = "settings"

      it(`shows an error and sets the entry as a backup in localStorage if "${settingsKey}" read from localStorage doesn't match the schema`, () => {
        // Invalid shape for `settings`
        // Expected value are booleans
        const settings = {
          EXTENSIONS_ENABLED: "true",
          PROXY_ENABLED: "true",
        }
        window.localStorage.setItem(settingsKey, JSON.stringify(settings))

        const getItemSpy = spyOnGetItem()
        const setItemSpy = spyOnSetItem()

        bindPersistenceService()

        expect(getItemSpy).toHaveBeenCalledWith(settingsKey)

        expect(toastErrorFn).toHaveBeenCalledWith(
          expect.stringContaining(settingsKey)
        )
        expect(setItemSpy).toHaveBeenCalledWith(
          `${settingsKey}-backup`,
          JSON.stringify(settings)
        )
      })

      it(`schema parsing succeeds if there is no "${settingsKey}" key present in localStorage where the fallback of "{}" is chosen`, () => {
        window.localStorage.removeItem(settingsKey)

        const getItemSpy = spyOnGetItem()
        const setItemSpy = spyOnSetItem()

        bindPersistenceService()

        expect(getItemSpy).toHaveBeenCalledWith(settingsKey)

        expect(toastErrorFn).not.toHaveBeenCalledWith(settingsKey)
        expect(setItemSpy).not.toHaveBeenCalled()
      })

      it(`reads the value for "${settingsKey}" from localStorage, invokes "performSettingsDataMigrations" and "bulkApplySettings" functions as required and subscribes to "settingsStore" updates`, () => {
        vi.mock("~/newstore/settings", async (importOriginal) => {
          const actualModule: Record<string, unknown> = await importOriginal()

          return {
            ...actualModule,
            applySetting: vi.fn(),
            bulkApplySettings: vi.fn(),
            performSettingsDataMigrations: vi
              .fn()
              .mockImplementation((data: any) => data),
            settingsStore: {
              subject$: {
                subscribe: vi.fn(),
              },
            },
          }
        })

        const { settings } = VUEX_DATA.postwoman
        window.localStorage.setItem(settingsKey, JSON.stringify(settings))

        const getItemSpy = spyOnGetItem()
        const setItemSpy = spyOnSetItem()

        bindPersistenceService()

        // toastErrorFn = vi.fn()

        expect(getItemSpy).toHaveBeenCalledWith(settingsKey)

        expect(toastErrorFn).not.toHaveBeenCalledWith(settingsKey)
        expect(setItemSpy).not.toHaveBeenCalled()

        expect(performSettingsDataMigrations).toHaveBeenCalledWith(settings)
        expect(bulkApplySettings).toHaveBeenCalledWith(settings)

        expect(settingsStore.subject$.subscribe).toHaveBeenCalledWith(
          expect.any(Function)
        )
      })
    })

    describe("Setup history persistence", () => {
      // Keys read from localStorage across test cases
      const historyKey = "history"
      const graphqlHistoryKey = "graphqlHistory"

      it(`shows an error and sets the entry as a backup in localStorage if "${historyKey}" read from localStorage doesn't match the schema`, () => {
        // Invalid shape for `history`
        // `v` -> `number`
        const restHistoryData = [{ ...REST_HISTORY, v: "1" }]
        window.localStorage.setItem(historyKey, JSON.stringify(restHistoryData))

        const getItemSpy = spyOnGetItem()
        const setItemSpy = spyOnSetItem()

        bindPersistenceService()

        expect(getItemSpy).toHaveBeenCalledWith(historyKey)

        expect(toastErrorFn).toHaveBeenCalledWith(
          expect.stringContaining(historyKey)
        )
        expect(setItemSpy).toHaveBeenCalledWith(
          `${historyKey}-backup`,
          JSON.stringify(restHistoryData)
        )
      })

      it(`REST history schema parsing succeeds if there is no "${historyKey}" key present in localStorage where the fallback of "[]" is chosen`, () => {
        window.localStorage.removeItem(historyKey)

        const getItemSpy = spyOnGetItem()
        const setItemSpy = spyOnSetItem()

        bindPersistenceService()

        expect(getItemSpy).toHaveBeenCalledWith(historyKey)

        expect(toastErrorFn).not.toHaveBeenCalledWith(historyKey)
        expect(setItemSpy).not.toHaveBeenCalled()
      })

      it(`shows an error and sets the entry as a backup in localStorage if "${graphqlHistoryKey}" read from localStorage doesn't match the schema`, () => {
        // Invalid shape for `graphqlHistory`
        // `v` -> `number`
        const graphqlHistoryData = [{ ...GQL_HISTORY, v: "1" }]
        window.localStorage.setItem(
          graphqlHistoryKey,
          JSON.stringify(graphqlHistoryData)
        )

        const getItemSpy = spyOnGetItem()
        const setItemSpy = spyOnSetItem()

        bindPersistenceService()

        expect(getItemSpy).toHaveBeenCalledWith(graphqlHistoryKey)

        expect(setItemSpy).toHaveBeenCalledWith(
          `${graphqlHistoryKey}-backup`,
          JSON.stringify(graphqlHistoryData)
        )
      })

      it(`GQL history schema parsing succeeds if there is no "${graphqlHistoryKey}" key present in localStorage where the fallback of "[]" is chosen`, () => {
        window.localStorage.removeItem(graphqlHistoryKey)

        const getItemSpy = spyOnGetItem()
        const setItemSpy = spyOnSetItem()

        bindPersistenceService()

        expect(getItemSpy).toHaveBeenCalledWith(graphqlHistoryKey)

        expect(toastErrorFn).not.toHaveBeenCalledWith(graphqlHistoryKey)
        expect(setItemSpy).not.toHaveBeenCalled()
      })

      it("reads REST and GQL history entries from localStorage, translates them to the new format, writes back the updates and subscribes to the respective store for updates", () => {
        vi.mock("~/newstore/history", () => {
          return {
            setGraphqlHistoryEntries: vi.fn(),
            setRESTHistoryEntries: vi.fn(),
            translateToNewGQLHistory: vi
              .fn()
              .mockImplementation((data: any) => data),
            translateToNewRESTHistory: vi
              .fn()
              .mockImplementation((data: any) => data),
            graphqlHistoryStore: {
              subject$: {
                subscribe: vi.fn(),
              },
            },
            restHistoryStore: {
              subject$: {
                subscribe: vi.fn(),
              },
            },
          }
        })

        const stringifiedRestHistory = JSON.stringify(REST_HISTORY)
        const stringifiedGqlHistory = JSON.stringify(GQL_HISTORY)

        window.localStorage.setItem(historyKey, stringifiedRestHistory)
        window.localStorage.setItem(graphqlHistoryKey, stringifiedGqlHistory)

        const getItemSpy = spyOnGetItem()
        const setItemSpy = spyOnSetItem()

        bindPersistenceService()

        expect(getItemSpy).toHaveBeenCalledWith(historyKey)
        expect(getItemSpy).toHaveBeenCalledWith(graphqlHistoryKey)

        expect(toastErrorFn).not.toHaveBeenCalledWith(
          historyKey,
          graphqlHistoryKey
        )
        expect(setItemSpy).not.toHaveBeenCalled()

        expect(translateToNewRESTHistory).toHaveBeenCalled()
        expect(translateToNewGQLHistory).toHaveBeenCalled()

        // This ensures `updatedOn` field is treated as a `string`
        const parsedRestHistory = JSON.parse(stringifiedRestHistory)
        const parsedGqlHistory = JSON.parse(stringifiedGqlHistory)

        expect(setRESTHistoryEntries).toHaveBeenCalledWith(parsedRestHistory)
        expect(setGraphqlHistoryEntries).toHaveBeenCalledWith(parsedGqlHistory)

        expect(restHistoryStore.subject$.subscribe).toHaveBeenCalledWith(
          expect.any(Function)
        )
        expect(graphqlHistoryStore.subject$.subscribe).toHaveBeenCalledWith(
          expect.any(Function)
        )
      })
    })

    describe("Setup collections persistence", () => {
      // Keys read from localStorage across test cases
      const collectionsKey = "collections"
      const collectionsGraphqlKey = "collectionsGraphql"

      it(`shows an error and sets the entry as a backup in localStorage if "${collectionsKey}" read from localStorage doesn't match the schema`, () => {
        // Invalid shape for `collections`
        // `v` -> `number`
        const restCollectionsData = [{ ...REST_COLLECTIONS, v: "1" }]
        window.localStorage.setItem(
          collectionsKey,
          JSON.stringify(restCollectionsData)
        )

        const getItemSpy = spyOnGetItem()
        const setItemSpy = spyOnSetItem()

        bindPersistenceService()

        expect(getItemSpy).toHaveBeenCalledWith(collectionsKey)

        expect(toastErrorFn).toHaveBeenCalledWith(
          expect.stringContaining(collectionsKey)
        )
        expect(setItemSpy).toHaveBeenCalledWith(
          `${collectionsKey}-backup`,
          JSON.stringify(restCollectionsData)
        )
      })

      it(`REST collections schema parsing succeeds if there is no "${collectionsKey}" key present in localStorage where the fallback of "[]" is chosen`, () => {
        window.localStorage.removeItem(collectionsKey)

        const getItemSpy = spyOnGetItem()
        const setItemSpy = spyOnSetItem()

        bindPersistenceService()

        expect(getItemSpy).toHaveBeenCalledWith(collectionsKey)

        expect(toastErrorFn).not.toHaveBeenCalledWith(collectionsKey)
        expect(setItemSpy).not.toHaveBeenCalled()
      })

      it(`shows an error and sets the entry as a backup in localStorage if "${collectionsGraphqlKey}" read from localStorage doesn't match the schema`, () => {
        // Invalid shape for `collectionsGraphql`
        // `v` -> `number`
        const graphqlCollectionsData = [{ ...GQL_COLLECTIONS, v: "1" }]
        window.localStorage.setItem(
          collectionsGraphqlKey,
          JSON.stringify(graphqlCollectionsData)
        )

        const getItemSpy = spyOnGetItem()
        const setItemSpy = spyOnSetItem()

        bindPersistenceService()

        expect(getItemSpy).toHaveBeenCalledWith(collectionsGraphqlKey)

        expect(toastErrorFn).toHaveBeenCalledWith(
          expect.stringContaining(collectionsGraphqlKey)
        )
        expect(setItemSpy).toHaveBeenCalledWith(
          `${collectionsGraphqlKey}-backup`,
          JSON.stringify(graphqlCollectionsData)
        )
      })

      it(`GQL history schema parsing succeeds if there is no "${collectionsGraphqlKey}" key present in localStorage where the fallback of "[]" is chosen`, () => {
        window.localStorage.removeItem(collectionsGraphqlKey)

        const getItemSpy = spyOnGetItem()
        const setItemSpy = spyOnSetItem()

        bindPersistenceService()

        expect(getItemSpy).toHaveBeenCalledWith(collectionsGraphqlKey)

        expect(toastErrorFn).not.toHaveBeenCalledWith(collectionsGraphqlKey)
        expect(setItemSpy).not.toHaveBeenCalled()
      })

      it("reads REST and GQL collection entries from localStorage, translates them to the new format, writes back the updates and subscribes to the respective store for updates", () => {
        vi.mock("@hoppscotch/data", async (importOriginal) => {
          const actualModule: Record<string, unknown> = await importOriginal()

          return {
            ...actualModule,
            translateToNewGQLCollection: vi
              .fn()
              .mockImplementation((data: any) => data),
            translateToNewRESTCollection: vi
              .fn()
              .mockImplementation((data: any) => data),
          }
        })

        vi.mock("~/newstore/collections", () => {
          return {
            setGraphqlCollections: vi.fn(),
            setRESTCollections: vi.fn(),
            graphqlCollectionStore: {
              subject$: {
                subscribe: vi.fn(),
              },
            },
            restCollectionStore: {
              subject$: {
                subscribe: vi.fn(),
              },
            },
          }
        })

        const restCollections = REST_COLLECTIONS
        const gqlCollections = GQL_COLLECTIONS

        window.localStorage.setItem(
          collectionsKey,
          JSON.stringify(restCollections)
        )

        window.localStorage.setItem(
          collectionsGraphqlKey,
          JSON.stringify(gqlCollections)
        )

        const getItemSpy = spyOnGetItem()
        const setItemSpy = spyOnSetItem()

        bindPersistenceService()

        expect(getItemSpy).toHaveBeenCalledWith(collectionsKey)
        expect(getItemSpy).toHaveBeenCalledWith(collectionsGraphqlKey)

        expect(toastErrorFn).not.toHaveBeenCalledWith(
          collectionsKey,
          collectionsGraphqlKey
        )
        expect(setItemSpy).not.toHaveBeenCalled()

        expect(translateToNewGQLCollection).toHaveBeenCalled()
        expect(translateToNewRESTCollection).toHaveBeenCalled()

        expect(setRESTCollections).toHaveBeenCalledWith(restCollections)
        expect(setGraphqlCollections).toHaveBeenCalledWith(gqlCollections)

        expect(graphqlCollectionStore.subject$.subscribe).toHaveBeenCalledWith(
          expect.any(Function)
        )
        expect(restCollectionStore.subject$.subscribe).toHaveBeenCalledWith(
          expect.any(Function)
        )
      })
    })

    describe("Setup environments persistence", () => {
      // Key read from localStorage across test cases
      const environmentsKey = "environments"

      it(`shows an error and sets the entry as a backup in localStorage if "${environmentsKey}" read from localStorage doesn't match the schema`, () => {
        // Invalid shape for `environments`
        const environments = [
          // `entries` -> `variables`
          { name: "Test", entries: [{ key: "test-key", value: "test-value" }] },
        ]

        window.localStorage.setItem(
          environmentsKey,
          JSON.stringify(environments)
        )

        const getItemSpy = spyOnGetItem()
        const setItemSpy = spyOnSetItem()

        bindPersistenceService()

        expect(getItemSpy).toHaveBeenCalledWith(environmentsKey)

        expect(toastErrorFn).toHaveBeenCalledWith(
          expect.stringContaining(environmentsKey)
        )
        expect(setItemSpy).toHaveBeenCalledWith(
          `${environmentsKey}-backup`,
          JSON.stringify(environments)
        )
      })

      it(`separates "globals" entries from "${environmentsKey}", subscribes to the "environmentStore" and updates localStorage entries`, () => {
        const environments = cloneDeep(ENVIRONMENTS)
        window.localStorage.setItem(
          "environments",
          JSON.stringify(environments)
        )

        const getItemSpy = spyOnGetItem()
        const setItemSpy = spyOnSetItem()

        bindPersistenceService()

        expect(getItemSpy).toHaveBeenCalledWith(environmentsKey)

        expect(toastErrorFn).not.toHaveBeenCalledWith(environmentsKey)
        expect(setItemSpy).not.toHaveBeenCalledWith(`${environmentsKey}-backup`)

        expect(addGlobalEnvVariable).toHaveBeenCalledWith(
          environments[0].variables[0]
        )

        // Removes `globals` from environments
        environments.splice(0, 1)

        expect(setItemSpy).toHaveBeenCalledWith(
          environmentsKey,
          JSON.stringify(environments)
        )
        expect(replaceEnvironments).toBeCalledWith(environments)
        expect(environments$.subscribe).toHaveBeenCalledWith(
          expect.any(Function)
        )
      })
    })

    describe("Setup selected environment persistence", () => {
      // Key read from localStorage across test cases
      const selectedEnvIndexKey = "selectedEnvIndex"

      it(`shows an error and sets the entry as a backup in localStorage if "${selectedEnvIndexKey}" read from localStorage doesn't match the schema`, () => {
        // Invalid shape for `selectedEnvIndex`
        // `index` -> `number`
        const selectedEnvIndex = {
          type: "MY_ENV",
          index: "1",
        }

        window.localStorage.setItem(
          selectedEnvIndexKey,
          JSON.stringify(selectedEnvIndex)
        )

        const getItemSpy = spyOnGetItem()
        const setItemSpy = spyOnSetItem()

        bindPersistenceService()

        expect(getItemSpy).toHaveBeenCalledWith(selectedEnvIndexKey)

        expect(toastErrorFn).toHaveBeenCalledWith(
          expect.stringContaining(selectedEnvIndexKey)
        )
        expect(setItemSpy).toHaveBeenCalledWith(
          `${selectedEnvIndexKey}-backup`,
          JSON.stringify(selectedEnvIndex)
        )
      })

      it(`schema parsing succeeds if there is no "${selectedEnvIndexKey}" key present in localStorage where the fallback of "null" is chosen`, () => {
        window.localStorage.removeItem(selectedEnvIndexKey)

        const getItemSpy = spyOnGetItem()
        const setItemSpy = spyOnSetItem()

        bindPersistenceService()

        expect(getItemSpy).toHaveBeenCalledWith(selectedEnvIndexKey)

        expect(toastErrorFn).not.toHaveBeenCalledWith(selectedEnvIndexKey)
        expect(setItemSpy).not.toHaveBeenCalled()
      })

      it(`sets it to the store if there is a value associated with the "${selectedEnvIndexKey}" key in localStorage`, () => {
        const selectedEnvIndex = {
          type: "MY_ENV",
          index: 1,
        }

        window.localStorage.setItem(
          selectedEnvIndexKey,
          JSON.stringify(selectedEnvIndex)
        )

        const getItemSpy = spyOnGetItem()
        const setItemSpy = spyOnSetItem()

        bindPersistenceService()

        expect(getItemSpy).toHaveBeenCalledWith(selectedEnvIndexKey)

        expect(toastErrorFn).not.toHaveBeenCalledWith(selectedEnvIndexKey)
        expect(setItemSpy).not.toHaveBeenCalled()

        expect(setSelectedEnvironmentIndex).toHaveBeenCalledWith(
          selectedEnvIndex
        )
        expect(selectedEnvironmentIndex$.subscribe).toHaveBeenCalledWith(
          expect.any(Function)
        )
      })

      it(`sets it to "NO_ENV_SELECTED" if there is no value associated with the "${selectedEnvIndexKey}" in localStorage`, () => {
        window.localStorage.removeItem(selectedEnvIndexKey)

        const getItemSpy = spyOnGetItem()
        const setItemSpy = spyOnSetItem()

        bindPersistenceService()

        expect(getItemSpy).toHaveBeenCalledWith(selectedEnvIndexKey)

        expect(toastErrorFn).not.toHaveBeenCalledWith(selectedEnvIndexKey)
        expect(setItemSpy).not.toHaveBeenCalled()

        expect(setSelectedEnvironmentIndex).toHaveBeenCalledWith({
          type: "NO_ENV_SELECTED",
        })
        expect(selectedEnvironmentIndex$.subscribe).toHaveBeenCalledWith(
          expect.any(Function)
        )
      })
    })

    describe("setup WebSocket persistence", () => {
      // Key read from localStorage across test cases
      const wsRequestKey = "WebsocketRequest"

      it(`shows an error and sets the entry as a backup in localStorage if "${wsRequestKey}" read from localStorage doesn't match the schema`, () => {
        // Invalid shape for `WebsocketRequest`
        const request = {
          endpoint: "wss://echo-websocket.hoppscotch.io",
          // `protocols` -> `[]`
          protocols: {},
        }

        window.localStorage.setItem(wsRequestKey, JSON.stringify(request))

        const getItemSpy = spyOnGetItem()
        const setItemSpy = spyOnSetItem()

        bindPersistenceService()

        expect(getItemSpy).toHaveBeenCalledWith(wsRequestKey)

        expect(toastErrorFn).toHaveBeenCalledWith(
          expect.stringContaining(wsRequestKey)
        )
        expect(setItemSpy).toHaveBeenCalledWith(
          `${wsRequestKey}-backup`,
          JSON.stringify(request)
        )
      })

      it(`schema parsing succeeds if there is no "${wsRequestKey}" key present in localStorage where the fallback of "null" is chosen`, () => {
        window.localStorage.removeItem(wsRequestKey)

        const getItemSpy = spyOnGetItem()
        const setItemSpy = spyOnSetItem()

        bindPersistenceService()

        expect(getItemSpy).toHaveBeenCalledWith(wsRequestKey)

        expect(toastErrorFn).not.toHaveBeenCalledWith(wsRequestKey)
        expect(setItemSpy).not.toHaveBeenCalled()
      })

      it(`reads the "${wsRequestKey}" entry from localStorage, sets it as the new request, subscribes to the "WSSessionStore" and updates localStorage entries`, () => {
        vi.mock("~/newstore/WebSocketSession", () => {
          return {
            setWSRequest: vi.fn(),
            WSRequest$: {
              subscribe: vi.fn(),
            },
          }
        })

        const request = {
          endpoint: "wss://echo-websocket.hoppscotch.io",
          protocols: [],
        }
        window.localStorage.setItem(wsRequestKey, JSON.stringify(request))

        const getItemSpy = spyOnGetItem()
        const setItemSpy = spyOnSetItem()

        bindPersistenceService()

        expect(getItemSpy).toHaveBeenCalledWith(wsRequestKey)

        expect(toastErrorFn).not.toHaveBeenCalledWith(wsRequestKey)
        expect(setItemSpy).not.toHaveBeenCalled()

        expect(setWSRequest).toHaveBeenCalledWith(request)
        expect(WSRequest$.subscribe).toHaveBeenCalledWith(expect.any(Function))
      })
    })

    describe("setup Socket.IO persistence", () => {
      // Key read from localStorage across test cases
      const sioRequestKey = "SocketIORequest"

      it(`shows an error and sets the entry as a backup in localStorage if "${sioRequestKey}" read from localStorage doesn't match the schema`, () => {
        // Invalid shape for `SocketIORequest`
        const request = {
          endpoint: "wss://echo-websocket.hoppscotch.io",
          path: "/socket.io",
          // `v` -> `version: v4`
          v: "4",
        }

        window.localStorage.setItem(sioRequestKey, JSON.stringify(request))

        const getItemSpy = spyOnGetItem()
        const setItemSpy = spyOnSetItem()

        bindPersistenceService()

        expect(getItemSpy).toHaveBeenCalledWith(sioRequestKey)

        expect(toastErrorFn).toHaveBeenCalledWith(
          expect.stringContaining(sioRequestKey)
        )
        expect(setItemSpy).toHaveBeenCalledWith(
          `${sioRequestKey}-backup`,
          JSON.stringify(request)
        )
      })

      it(`schema parsing succeeds if there is no "${sioRequestKey}" key present in localStorage where the fallback of "null" is chosen`, () => {
        window.localStorage.removeItem(sioRequestKey)

        const getItemSpy = spyOnGetItem()
        const setItemSpy = spyOnSetItem()

        bindPersistenceService()

        expect(getItemSpy).toHaveBeenCalledWith(sioRequestKey)

        expect(toastErrorFn).not.toHaveBeenCalledWith(sioRequestKey)
        expect(setItemSpy).not.toHaveBeenCalled()
      })

      it(`reads the "${sioRequestKey}" entry from localStorage, sets it as the new request, subscribes to the "SIOSessionStore" and updates localStorage entries`, () => {
        vi.mock("~/newstore/SocketIOSession", () => {
          return {
            setSIORequest: vi.fn(),
            SIORequest$: {
              subscribe: vi.fn(),
            },
          }
        })

        const request = {
          endpoint: "wss://echo-socketio.hoppscotch.io",
          path: "/socket.io",
          version: "v4",
        }

        window.localStorage.setItem(sioRequestKey, JSON.stringify(request))

        const getItemSpy = spyOnGetItem()
        const setItemSpy = spyOnSetItem()

        bindPersistenceService()

        expect(getItemSpy).toHaveBeenCalledWith(sioRequestKey)

        expect(toastErrorFn).not.toHaveBeenCalledWith(sioRequestKey)
        expect(setItemSpy).not.toHaveBeenCalled()

        expect(setSIORequest).toHaveBeenCalledWith(request)
        expect(SIORequest$.subscribe).toHaveBeenCalledWith(expect.any(Function))
      })
    })

    describe("setup SSE Persistence", () => {
      // Key read from localStorage across test cases
      const sseRequestKey = "SSERequest"

      it(`shows an error and sets the entry as a backup in localStorage if "${sseRequestKey}" read from localStorage doesn't match the versioned schema`, () => {
        // Invalid shape for `SSERequest`
        const request = {
          // `url` -> `endpoint`
          url: "https://express-eventsource.herokuapp.com/events",
          eventType: "data",
        }

        window.localStorage.setItem(sseRequestKey, JSON.stringify(request))

        const getItemSpy = spyOnGetItem()
        const setItemSpy = spyOnSetItem()

        bindPersistenceService()

        expect(getItemSpy).toHaveBeenCalledWith(sseRequestKey)

        expect(toastErrorFn).toHaveBeenCalledWith(
          expect.stringContaining(sseRequestKey)
        )
        expect(setItemSpy).toHaveBeenCalledWith(
          `${sseRequestKey}-backup`,
          JSON.stringify(request)
        )
      })

      it(`schema parsing succeeds if there is no "${sseRequestKey}" key present in localStorage where the fallback of "null" is chosen`, () => {
        window.localStorage.removeItem(sseRequestKey)

        const getItemSpy = spyOnGetItem()
        const setItemSpy = spyOnSetItem()

        bindPersistenceService()

        expect(getItemSpy).toHaveBeenCalledWith(sseRequestKey)

        expect(toastErrorFn).not.toHaveBeenCalledWith(sseRequestKey)
        expect(setItemSpy).not.toHaveBeenCalled()
      })

      it(`reads the "${sseRequestKey}" entry from localStorage, sets it as the new request, subscribes to the "SSESessionStore" and updates localStorage entries`, () => {
        vi.mock("~/newstore/SSESession", () => {
          return {
            setSSERequest: vi.fn(),
            SSERequest$: {
              subscribe: vi.fn(),
            },
          }
        })

        const request = {
          endpoint: "https://express-eventsource.herokuapp.com/events",
          eventType: "data",
        }
        window.localStorage.setItem(sseRequestKey, JSON.stringify(request))

        const getItemSpy = spyOnGetItem()
        const setItemSpy = spyOnSetItem()

        bindPersistenceService()

        expect(getItemSpy).toHaveBeenCalledWith(sseRequestKey)

        expect(toastErrorFn).not.toHaveBeenCalledWith(sseRequestKey)
        expect(setItemSpy).not.toHaveBeenCalled()

        expect(setSSERequest).toHaveBeenCalledWith(request)
        expect(SSERequest$.subscribe).toHaveBeenCalledWith(expect.any(Function))
      })
    })

    describe("setup MQTT Persistence", () => {
      // Key read from localStorage across test cases
      const mqttRequestKey = "MQTTRequest"

      it(`shows an error and sets the entry as a backup in localStorage if "${mqttRequestKey}" read from localStorage doesn't match the schema`, () => {
        // Invalid shape for `MQTTRequest`
        const request = {
          // `url` -> `endpoint`
          url: "wss://test.mosquitto.org:8081",
          clientID: "hoppscotch",
        }

        window.localStorage.setItem(mqttRequestKey, JSON.stringify(request))

        const getItemSpy = spyOnGetItem()
        const setItemSpy = spyOnSetItem()

        bindPersistenceService()

        expect(getItemSpy).toHaveBeenCalledWith(mqttRequestKey)

        expect(toastErrorFn).toHaveBeenCalledWith(
          expect.stringContaining(mqttRequestKey)
        )
        expect(setItemSpy).toHaveBeenCalledWith(
          `${mqttRequestKey}-backup`,
          JSON.stringify(request)
        )
      })

      it(`schema parsing succeeds if there is no "${mqttRequestKey}" key present in localStorage where the fallback of "null" is chosen`, () => {
        window.localStorage.removeItem(mqttRequestKey)

        const getItemSpy = spyOnGetItem()
        const setItemSpy = spyOnSetItem()

        bindPersistenceService()

        expect(getItemSpy).toHaveBeenCalledWith(mqttRequestKey)

        expect(toastErrorFn).not.toHaveBeenCalledWith(mqttRequestKey)
        expect(setItemSpy).not.toHaveBeenCalled()
      })

      it(`reads the ${mqttRequestKey}" entry from localStorage, sets it as the new request, subscribes to the "MQTTSessionStore" and updates localStorage entries`, () => {
        vi.mock("~/newstore/MQTTSession", () => {
          return {
            setMQTTRequest: vi.fn(),
            MQTTRequest$: {
              subscribe: vi.fn(),
            },
          }
        })

        const request = {
          endpoint: "wss://test.mosquitto.org:8081",
          clientID: "hoppscotch",
        }
        window.localStorage.setItem(mqttRequestKey, JSON.stringify(request))

        const getItemSpy = spyOnGetItem()
        const setItemSpy = spyOnSetItem()

        bindPersistenceService()

        expect(getItemSpy).toHaveBeenCalledWith(mqttRequestKey)

        expect(toastErrorFn).not.toHaveBeenCalledWith(mqttRequestKey)
        expect(setItemSpy).not.toHaveBeenCalled()

        expect(setMQTTRequest).toHaveBeenCalledWith(request)
        expect(MQTTRequest$.subscribe).toHaveBeenCalledWith(
          expect.any(Function)
        )
      })
    })

    describe("setup global environments persistence", () => {
      // Key read from localStorage across test cases
      const globalEnvKey = "globalEnv"

      it(`shows an error and sets the entry as a backup in localStorage if "${globalEnvKey}" read from localStorage doesn't match the schema`, () => {
        // Invalid shape for `globalEnv`
        const globalEnv = [
          {
            // `key` -> `string`
            key: 1,
            value: "testValue",
          },
        ]

        window.localStorage.setItem(globalEnvKey, JSON.stringify(globalEnv))

        const getItemSpy = spyOnGetItem()
        const setItemSpy = spyOnSetItem()

        bindPersistenceService()

        expect(getItemSpy).toHaveBeenCalledWith(globalEnvKey)

        expect(toastErrorFn).toHaveBeenCalledWith(
          expect.stringContaining(globalEnvKey)
        )
        expect(setItemSpy).toHaveBeenCalledWith(
          `${globalEnvKey}-backup`,
          JSON.stringify(globalEnv)
        )
      })

      it(`schema parsing succeeds if there is no "${globalEnvKey}" key present in localStorage where the fallback of "[]" is chosen`, () => {
        window.localStorage.removeItem(globalEnvKey)

        const getItemSpy = spyOnGetItem()
        const setItemSpy = spyOnSetItem()

        bindPersistenceService()

        expect(getItemSpy).toHaveBeenCalledWith(globalEnvKey)

        expect(toastErrorFn).not.toHaveBeenCalledWith(globalEnvKey)
        expect(setItemSpy).not.toHaveBeenCalled()
      })

      it(`reads the "globalEnv" entry from localStorage, dispatches the new value, subscribes to the "environmentsStore" and updates localStorage entries`, () => {
        const globalEnv: Environment["variables"] = [
          { key: "testKey", value: "testValue" },
        ]
        window.localStorage.setItem(globalEnvKey, JSON.stringify(globalEnv))

        const getItemSpy = spyOnGetItem()
        const setItemSpy = spyOnSetItem()

        bindPersistenceService()

        expect(getItemSpy).toHaveBeenCalledWith(globalEnvKey)

        expect(toastErrorFn).not.toHaveBeenCalledWith(globalEnvKey)
        expect(setItemSpy).not.toHaveBeenCalled()

        expect(setGlobalEnvVariables).toHaveBeenCalledWith(globalEnv)
        expect(globalEnv$.subscribe).toHaveBeenCalledWith(expect.any(Function))
      })
    })

    describe("setup GQL tabs persistence", () => {
      // Key read from localStorage across test cases
      const gqlTabStateKey = "gqlTabState"

      const loadTabsFromPersistedStateFn = vi.fn()
      const mocks = { loadTabsFromPersistedState: loadTabsFromPersistedStateFn }

      it(`shows an error and sets the entry as a backup in localStorage if "${gqlTabStateKey}" read from localStorage doesn't match the schema`, () => {
        // Invalid shape for `gqlTabState`
        // `lastActiveTabID` -> `string`
        const gqlTabState = { ...GQL_TAB_STATE, lastActiveTabID: 1234 }

        window.localStorage.setItem(gqlTabStateKey, JSON.stringify(gqlTabState))

        const getItemSpy = spyOnGetItem()
        const setItemSpy = spyOnSetItem()

        bindPersistenceService()

        expect(getItemSpy).toHaveBeenCalledWith(gqlTabStateKey)

        expect(toastErrorFn).toHaveBeenCalledWith(
          expect.stringContaining(gqlTabStateKey)
        )
        expect(setItemSpy).toHaveBeenCalledWith(
          `${gqlTabStateKey}-backup`,
          JSON.stringify(gqlTabState)
        )
      })

      it(`skips schema parsing and the loading of persisted tabs if there is no "${gqlTabStateKey}" key present in localStorage`, () => {
        window.localStorage.removeItem(gqlTabStateKey)

        const getItemSpy = spyOnGetItem()
        const setItemSpy = spyOnSetItem()

        bindPersistenceService({ bindGQLTabService: true, mocks })

        expect(getItemSpy).toHaveBeenCalledWith(gqlTabStateKey)

        expect(toastErrorFn).not.toHaveBeenCalledWith(gqlTabStateKey)
        expect(setItemSpy).not.toHaveBeenCalled()
        expect(loadTabsFromPersistedStateFn).not.toHaveBeenCalled()

        expect(watchDebounced).toHaveBeenCalled()
      })

      it("loads tabs from the state persisted in localStorage and sets watcher for `persistableTabState`", () => {
        const tabState = GQL_TAB_STATE
        window.localStorage.setItem(gqlTabStateKey, JSON.stringify(tabState))

        const getItemSpy = spyOnGetItem()
        const setItemSpy = spyOnSetItem()

        bindPersistenceService({ bindGQLTabService: true, mocks })

        expect(getItemSpy).toHaveBeenCalledWith(gqlTabStateKey)

        expect(toastErrorFn).not.toHaveBeenCalledWith(gqlTabStateKey)
        expect(setItemSpy).not.toHaveBeenCalled()

        expect(loadTabsFromPersistedStateFn).toHaveBeenCalledWith(tabState)
        expect(watchDebounced).toHaveBeenCalledWith(
          expect.any(Object),
          expect.any(Function),
          { debounce: 500, deep: true }
        )
      })

      it("logs an error to the console on failing to parse persisted tab state", () => {
        window.localStorage.setItem(gqlTabStateKey, "invalid-json")

        console.error = vi.fn()
        const getItemSpy = spyOnGetItem()
        const setItemSpy = spyOnSetItem()

        bindPersistenceService()

        expect(getItemSpy).toHaveBeenCalledWith(gqlTabStateKey)

        expect(toastErrorFn).not.toHaveBeenCalledWith(gqlTabStateKey)
        expect(setItemSpy).not.toHaveBeenCalled()

        expect(console.error).toHaveBeenCalledWith(
          `Failed parsing persisted tab state, state:`,
          window.localStorage.getItem(gqlTabStateKey)
        )
        expect(watchDebounced).toHaveBeenCalledWith(
          expect.any(Object),
          expect.any(Function),
          { debounce: 500, deep: true }
        )
      })
    })

    describe("setupRESTTabsPersistence", () => {
      // Key read from localStorage across test cases
      const restTabStateKey = "restTabState"

      const loadTabsFromPersistedStateFn = vi.fn()
      const mocks = { loadTabsFromPersistedState: loadTabsFromPersistedStateFn }

      it(`shows an error and sets the entry as a backup in localStorage if "${restTabStateKey}" read from localStorage doesn't match the schema`, () => {
        // Invalid shape for `restTabState`
        // `lastActiveTabID` -> `string`
        const restTabState = { ...REST_TAB_STATE, lastActiveTabID: 1234 }

        window.localStorage.setItem(
          restTabStateKey,
          JSON.stringify(restTabState)
        )

        const getItemSpy = spyOnGetItem()
        const setItemSpy = spyOnSetItem()

        bindPersistenceService()

        expect(getItemSpy).toHaveBeenCalledWith(restTabStateKey)

        expect(toastErrorFn).toHaveBeenCalledWith(
          expect.stringContaining(restTabStateKey)
        )
        expect(setItemSpy).toHaveBeenCalledWith(
          `${restTabStateKey}-backup`,
          JSON.stringify(restTabState)
        )
      })

      it(`skips schema parsing and the loading of persisted tabs if there is no "${restTabStateKey}" key present in localStorage`, () => {
        window.localStorage.removeItem(restTabStateKey)

        const getItemSpy = spyOnGetItem()
        const setItemSpy = spyOnSetItem()

        bindPersistenceService({ bindRESTTabService: true, mocks })

        expect(getItemSpy).toHaveBeenCalledWith(restTabStateKey)

        expect(toastErrorFn).not.toHaveBeenCalledWith(restTabStateKey)
        expect(setItemSpy).not.toHaveBeenCalled()
        expect(loadTabsFromPersistedStateFn).not.toHaveBeenCalled()

        expect(watchDebounced).toHaveBeenCalled()
      })

      it("loads tabs from the state persisted in localStorage and sets watcher for `persistableTabState`", () => {
        const tabState = REST_TAB_STATE
        window.localStorage.setItem(restTabStateKey, JSON.stringify(tabState))

        const getItemSpy = spyOnGetItem()
        const setItemSpy = spyOnSetItem()

        bindPersistenceService({ bindRESTTabService: true, mocks })

        expect(getItemSpy).toHaveBeenCalledWith(restTabStateKey)

        expect(toastErrorFn).not.toHaveBeenCalledWith(restTabStateKey)
        expect(setItemSpy).not.toHaveBeenCalled()

        expect(loadTabsFromPersistedStateFn).toHaveBeenCalledWith(tabState)
        expect(watchDebounced).toHaveBeenCalledWith(
          expect.any(Object),
          expect.any(Function),
          { debounce: 500, deep: true }
        )
      })

      it("logs an error to the console on failing to parse persisted tab state", () => {
        window.localStorage.setItem(restTabStateKey, "invalid-json")

        console.error = vi.fn()
        const getItemSpy = spyOnGetItem()
        const setItemSpy = spyOnSetItem()

        bindPersistenceService()

        expect(getItemSpy).toHaveBeenCalledWith(restTabStateKey)

        expect(toastErrorFn).not.toHaveBeenCalledWith(restTabStateKey)
        expect(setItemSpy).not.toHaveBeenCalled()

        expect(console.error).toHaveBeenCalledWith(
          `Failed parsing persisted tab state, state:`,
          window.localStorage.getItem(restTabStateKey)
        )
        expect(watchDebounced).toHaveBeenCalledWith(
          expect.any(Object),
          expect.any(Function),
          { debounce: 500, deep: true }
        )
      })
    })
  })

  it("`setLocalConfig` method sets a value in localStorage", () => {
    const testKey = "test-key"
    const testValue = "test-value"

    const setItemSpy = spyOnSetItem()

    const service = bindPersistenceService()

    service.setLocalConfig(testKey, testValue)
    expect(setItemSpy).toHaveBeenCalledWith(testKey, testValue)
  })

  it("`getLocalConfig` method gets a value from localStorage", () => {
    const testKey = "test-key"
    const testValue = "test-value"

    const setItemSpy = spyOnSetItem()
    const getItemSpy = spyOnGetItem()

    const service = bindPersistenceService()

    service.setLocalConfig(testKey, testValue)
    const retrievedValue = service.getLocalConfig(testKey)

    expect(setItemSpy).toHaveBeenCalledWith(testKey, testValue)
    expect(getItemSpy).toHaveBeenCalledWith(testKey)
    expect(retrievedValue).toBe(testValue)
  })

  it("`removeLocalConfig` method clears a value in localStorage", () => {
    const testKey = "test-key"
    const testValue = "test-value"

    const setItemSpy = spyOnSetItem()
    const removeItemSpy = spyOnRemoveItem()

    const service = bindPersistenceService()

    service.setLocalConfig(testKey, testValue)
    service.removeLocalConfig(testKey)

    expect(setItemSpy).toHaveBeenCalledWith(testKey, testValue)
    expect(removeItemSpy).toHaveBeenCalledWith(testKey)
  })
})
