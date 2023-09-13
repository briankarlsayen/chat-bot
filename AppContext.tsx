import { IApi } from '../../../../data_sources/complete';
import { ExportOptions } from 'dexie-export-import';
import React, { useEffect, useContext } from 'react';
import * as OneplaceComponents from 'oneplace-components';
import { i18n } from '../../../../i18n';
import { environment, settings } from '../../../../env';
import { useFetchSettings } from '../../../../data_sources/api';
import { IUserCapabilities, User } from '../model/User';

export type NetworkStateChangeListener = () => void;
export interface IOneplaceComponents extends OneplaceComponents.IClient {
  initialise(): Promise<void>;
  getEnv(): OneplaceComponents.IEnvironment;
}

export type AuthStatus =
  | 'offline'
  | 'cached_user'
  | 'connecting'
  | 'login_required'
  | 'online'
  | 'unknown';

export interface IIDTokens {
  userId: string;
  token: string;
  refreshToken: string;
  idToken: string;
  identityProvider?: string;
}

export interface IOnePlaceAuth {
  user: User;
  cachedUser: boolean;
  status: AuthStatus;
  tokens: IIDTokens | null;

  authenticateUser(): Promise<boolean>;
  login(): Promise<boolean>;
  logout(): Promise<boolean>;
  forceLogout(): void;
  checkAuth(): Promise<boolean>;
  getUserCapabilities(): Promise<IUserCapabilities>;
  updateUserDatabase(databaseName: string): void;
  getRegistration(): Promise<IRegistration>;
  updateRegistration(registration: IRegistration): void;
  getToken(): Promise<IIDTokens | null>;
  addListener: (listener: AuthStatusChangeListener) => void;
  removeListener: (listener: AuthStatusChangeListener) => void;
}
export type AuthStatusChangeListener = () => void;

export default interface IRegistration {
  token: string;
  subject: string;
}

export interface INetworkStatus {
  initialise: () => Promise<void>;
  isOffline: boolean;
  addListener: (listener: NetworkStateChangeListener) => void;
  removeListener: (listener: NetworkStateChangeListener) => void;
}
export type AppStatus =
  | 'initialising'
  | 'login_required'
  | 'active'
  | 'error'
  | 'reload_required'
  | 'logout';

export type SyncStatus = 'disabled' | 'enabled' | 'in_progress';

export interface ISyncOptions {
  forceFullSync: boolean;
}

export interface ISyncManager {
  initialise(): Promise<void>;

  syncStatus: SyncStatus;
  syncStatusLabel: string;
  shouldShowCacheAlert(): boolean;
  doSync(options: ISyncOptions): Promise<void>;
  cancelSync(): void;

  addListener: (listener: () => void) => void;
  removeListener: (listener: () => void) => void;
}

export interface IImageStorage extends OneplaceComponents.IImageStorage {
  export(option: ExportOptions, ids?: number[]): Promise<Blob>;
  import(exportedData: Blob): Promise<void>;
  removeFiles(assetList: string[]): void;
}

export interface IAppProviderContext {
  message?: string | null;
  appStatus: AppStatus;
  net: INetworkStatus;
  auth: IOnePlaceAuth;
  db: any;
  api: IApi;
  sync: ISyncManager;
  lang: string;
  imageStorage: IImageStorage;
  assetCache: any;
  backupManager: any;
  goOnline(): void;
  logOut(): void;
  forceLogout(): void;
  stayLoggedIn(): void;
  oneplaceComponents: IOneplaceComponents;
  i18next: any;
}

export interface IAppContextProp {
  ctx: IAppProviderContext;
  capabilities: IUserCapabilities;
}

export const AppContext = React.createContext<IAppProviderContext>(null as any);

export function withAppContext<TComponentProps extends IAppContextProp>(
  Component: React.ComponentType<TComponentProps>
) {
  return function AppcontextComponent(
    props: Pick<
      TComponentProps,
      Exclude<keyof TComponentProps, keyof IAppContextProp>
    >
  ) {
    const client = new OneplaceComponents.Client({
      api: new OneplaceComponents.Api(),
      settings: settings,
    });
    useEffect(() => {
      initialize();
    }, []);
    const initialize = async () => {
      await i18n.initialise();
    };

    const [response] = useFetchSettings();
    const ctx = useContext(OneplaceComponents.OneplaceLibraryContext);

    return (
      response && (
        <AppContext.Consumer>
          {() => (
            <OneplaceComponents.OneplaceLibraryContextProvider
              env={environment}
              i18n={i18n._instance}
              client={client}
              imageStorage={ctx.imageStorage}
            >
              <Component
                {...(props as TComponentProps)}
                ctx={ctx}
                client={client}
                capabilities={response.capabilities}
              />
            </OneplaceComponents.OneplaceLibraryContextProvider>
          )}
        </AppContext.Consumer>
      )
    );
  };
}
