import React from 'react';
import { useHistory } from 'react-router-dom';

export interface INavigationContextProp {
  nav: INavigationContext;
}

export interface INavigationUpdate {
  title: string;
  showBackButton?: boolean;
  mainActionLabel?: string;
  backButtonConfirmationMsg?: string;
  onMainAction?: () => void;
}

export interface INavigationContext {
  updateNavigation: (update: INavigationUpdate) => void;
  goBack: () => void;
  goTo: (url: string) => void;
}

export const NavigationContext = React.createContext<INavigationContext>(
  null as any
);

export function withNavigationContext<
  TComponentProps extends INavigationContextProp
>(Component: React.ComponentType<TComponentProps>) {
  return function NavigationContextComponent(
    props: Pick<
      TComponentProps,
      Exclude<keyof TComponentProps, keyof INavigationContextProp>
    >
  ) {
    const history = useHistory();
    const newNav = {
      nav: {
        goBack: history.location,
      },
    };
    return (
      <NavigationContext.Consumer>
        {(nav) => (
          <Component
            {...(props as TComponentProps)}
            nav={newNav}
            // history={history}
          />
        )}
      </NavigationContext.Consumer>
    );
  };
}
