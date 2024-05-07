/* No cookies were found in the auth request
 * (AuthService)
 */
export const COOKIES_NOT_FOUND = 'auth/cookies_not_found' as const;

export const UNAUTHORIZED = 'Unauthorized' as const;

// Sometimes the backend returns Unauthorized error message as follows:
export const GRAPHQL_UNAUTHORIZED = '[GraphQL] Unauthorized' as const;

// When trying to remove the only admin account
export const ONLY_ONE_ADMIN_ACCOUNT_FOUND =
  '[GraphQL] admin/only_one_admin_account_found' as const;

// When trying to delete an admin account
export const ADMIN_CANNOT_BE_DELETED =
  'admin/admin_can_not_be_deleted' as const;

// When trying to invite a user that is already invited
export const USER_ALREADY_INVITED =
  '[GraphQL] admin/user_already_invited' as const;

// When attempting to delete a user who is an owner of a team
export const USER_IS_OWNER = 'user/is_owner';

// When attempting to delete a user who is the only owner of a team
export const TEAM_ONLY_ONE_OWNER = '[GraphQL] team/only_one_owner';

// Even one auth provider is not specified
export const AUTH_PROVIDER_NOT_SPECIFIED =
  '[GraphQL] auth/provider_not_specified' as const;

const ERROR_MESSAGES = [
  {
    name: ONLY_ONE_ADMIN_ACCOUNT_FOUND,
    message: 'state.remove_admin_failure_only_one_admin',
  },
  {
    name: ADMIN_CANNOT_BE_DELETED,
    message: 'state.remove_admin_for_deletion',
    alternateMessage: 'state.remove_admin_to_delete_user',
  },
  {
    name: USER_ALREADY_INVITED,
    message: 'state.user_already_invited',
  },
  {
    name: USER_IS_OWNER,
    message: 'state.remove_owner_to_delete_user',
    alternateMessage: 'state.remove_owner_for_deletion',
  },
  {
    name: TEAM_ONLY_ONE_OWNER,
    message: 'state.remove_owner_failure_only_one_owner',
  },

  {
    name: AUTH_PROVIDER_NOT_SPECIFIED,
    message: 'configs.auth_providers.provider_not_specified',
  },
];

export const isErrorPresent = (error: string) =>
  ERROR_MESSAGES.some((err) => err.name === error);

export const getErrorMessage = (name: string, altMessage = false) => {
  const error = ERROR_MESSAGES.find((error) => error.name === name);
  return altMessage ? error?.alternateMessage ?? '' : error?.message ?? '';
};
