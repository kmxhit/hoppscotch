import { Environment, HoppCollection, HoppRESTRequest } from "@hoppscotch/data"
import { Ref } from "vue"

import { HoppInheritedRESTProperty } from "~/helpers/types/HoppInheritedProperties"

// Shared across REST/GQL collections
export type CollectionLevelAuthHeadersView = {
  auth: HoppInheritedRESTProperty["auth"]
  headers: HoppInheritedRESTProperty["headers"]
}

export type RESTCollectionViewCollection = {
  collectionID: string

  isLastItem: boolean
  name: string
  parentCollectionID: string | null
}

export type RESTCollectionViewRequest = {
  collectionID: string
  requestID: string

  request: HoppRESTRequest
  isLastItem: boolean
}

export type RESTCollectionViewItem =
  | { type: "collection"; value: RESTCollectionViewCollection }
  | { type: "request"; value: RESTCollectionViewRequest }

export interface RootRESTCollectionView {
  providerID: string
  workspaceID: string

  loading: Ref<boolean>

  collections: Ref<RESTCollectionViewCollection[]>
}

export interface RESTCollectionChildrenView {
  providerID: string
  workspaceID: string
  collectionID: string

  loading: Ref<boolean>

  content: Ref<RESTCollectionViewItem[]>
}

// Shared across REST/GQL collections
export interface SearchResultsView {
  providerID: string
  workspaceID: string

  loading: Ref<boolean>

  results: Ref<HoppCollection[]>
  onSessionEnd: () => void
}

// Shared across REST/GQL collections
export interface CollectionJSONView {
  providerID: string
  workspaceID: string

  content: string
}

export interface RESTEnvironmentsView {
  providerID: string
  workspaceID: string

  // TODO: Evaluate if this needs to be a `ref`
  environments: Ref<Environment[]>
}
