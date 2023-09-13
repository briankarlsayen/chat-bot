import React from 'react';
import { i18n } from '../../../../i18n';
import {
  RouteComponentProps,
  Redirect,
  RedirectProps,
  withRouter,
} from 'react-router';
import { initNewChecklistData, updateChecklistAssignee } from './checklistData';
import { Api, IApi } from '../../../../data_sources/complete';
import { debounce } from 'debounce';
import '../react_table/react-table.css';
import '../react_table/react-table-custom.css';
import styles from './ChecklistStyles';
import { ChecklistHeader } from './ChecklistHeader';
// import { ChecklistInfo } from './ChecklistInfo'
import { ChecklistFooter } from './ChecklistFooter';
import Typography from '@material-ui/core/Typography';
import oneplaceThemeSecondary from '../../../../theme/oneplace-theme-checklist';
import {
  ThemeProvider,
  withStyles,
  WithStyles,
} from '@material-ui/core/styles';
import {
  TabsComponent,
  QuestionGroup,
  IChecklistField,
  ITabDefinition,
  IChecklist,
  IChecklistRenderProps,
  IChecklistGroup,
  IFranchisee,
  ISite,
  getSiteFranchiseeId,
  AssigneeType,
  IChecklistConditionalRule,
  hasConditionApplied,
  isConditionalRuleShow,
  findChecklistGroupById,
  getRenderProps,
  updateQuestionNumbers,
  validateChecklist,
  validateGroups,
  CheckCircleCustomColor,
  ISites,
  IFranchisees,
  getSite,
  getFranchisee,
  IAssignment,
  IChecklistTicketJson,
  IAttribute,
} from 'oneplace-components';
import {
  fetchChecklist,
  fetchFranchisees,
  fetchSites,
} from '../../../../data_sources/checklist';
import { ChecklistActions } from '../common/ChecklistActions';
import { IAppContextProp, withAppContext } from '../utils/AppContext';
import { INewTicketDefaults } from '../tickets';
import { formatDate } from '../utils/dates';

import { NewTicketDialog } from '../tickets/NewTicketDialog';
import { getSiteAttributes } from '../utils';
import { ChecklistTicketsDialog } from '../tickets/ChecklistTicketsDialog';
import { EditTicketDialog } from '../tickets/EditTicketDialog';
import {
  FeatureFlagProviderProps,
  withFeatureFlagsContext,
} from '../../../feature/featureflags';
import {
  INavigationContextProp,
  withNavigationContext,
} from '../utils/Navigation';
i18n.initialise();

const autoSaveDelay = 1000;

type LoadStatus = 'loading' | 'loaded' | 'load_error';
interface IChecklistRespondent {
  email: string;
  name?: string;
}

export interface IChecklistProps
  extends RouteComponentProps<any>,
    WithStyles<typeof styles>,
    INavigationContextProp,
    IAppContextProp,
    FeatureFlagProviderProps {}

export interface IChecklistState {
  api: IApi;
  checklistInfoResponse: IChecklistInfoResponse;
  submitted: boolean;
  checklistId: number; // 0 = not submitted, >0 = submitted
  assigneeType: AssigneeType;
  assigneeId: number;
  franchisee?: IFranchisee;
  site?: ISite;
  checklist: IChecklist | null;
  renderProps: IChecklistRenderProps | null;
  loadStatus: LoadStatus;
  showValidationErrorDialog: boolean;
  showEmailDialog: boolean;
  showTicketDialog: boolean;
  validationErrors: string[];
  showSubmitDialog: boolean;
  questionsNeedRefresh: boolean;
  redirectToHome: RedirectProps | null;
  incompleteFields: boolean;
  disableTabs: boolean;
  sites: ISites;
  franchisees: IFranchisees;
  ticketDefaults?: INewTicketDefaults;
  showChecklistTicketsDialog: boolean;
  location: any;
  showEditTicketDialog: boolean;
  ticketId?: number;
}

export interface IChecklistInfoAssignments {
  franchisees: IFranchisee[] | null;
  sites: ISite[] | null;
}

export interface IChecklistInfoResponse {
  site?: any;
  franchisee?: any;
  checklist: IChecklist;
  //when error
  success?: boolean;
  data?: string;
  assignee?: string;
  assigneeId?: number;
}

export const Checklist = withStyles(styles)(
  withRouter(
    withNavigationContext(
      withAppContext(
        withFeatureFlagsContext(
          class extends React.Component<IChecklistProps, IChecklistState> {
            conditionalRulesList: IChecklistConditionalRule[] = [];
            debouncedSave = debounce(this.save, autoSaveDelay);
            respondent: IChecklistRespondent = {
              email: '',
              name: '',
            };
            checklistTicketsCount: number;

            constructor(props: IChecklistProps) {
              super(props);
              this.onChecklistChanged = this.onChecklistChanged.bind(this);
              this.onTicketPreset = this.onTicketPreset.bind(this);
              this.onNewTicket = this.onNewTicket.bind(this);
              this.onChecklistReassigned =
                this.onChecklistReassigned.bind(this);
              this.checklistTicketsCount = 0;
              console.log('history', this.props.history);
              const locState = this.props.location.state as any;
              const locationState = {
                assigneeType: locState?.assignee,
                selectedAssigneeId: locState?.assigneeId,
                checklistInfoResponse: {
                  ...locState,
                },
              } as any;

              let checklist = null,
                checklistInfoResponse = null,
                selectedAssigneeId = null,
                assigneeType = null;
              let redirectToHome = null;

              //the user comes from home page
              if (
                locationState &&
                locationState.checklistInfoResponse &&
                locState
              ) {
                checklistInfoResponse = locationState.checklistInfoResponse;
                selectedAssigneeId = locationState.selectedAssigneeId;
                assigneeType = locationState.assigneeType;
                checklist = locationState.checklistInfoResponse.checklist;
              }

              this.state = {
                api: new Api(),
                checklistInfoResponse,
                submitted: false,
                checklistId: 0,
                checklist,
                renderProps: null,
                showValidationErrorDialog: false,
                validationErrors: [],
                showSubmitDialog: false,
                incompleteFields: false,
                showEmailDialog: false,
                showTicketDialog: false,
                questionsNeedRefresh: false,
                loadStatus: 'loading',
                assigneeType,
                assigneeId: selectedAssigneeId,
                redirectToHome,
                disableTabs: false,
                franchisees: locState?.franchisees,
                sites: locState?.sites,
                ticketDefaults: undefined,
                showChecklistTicketsDialog: false,
                location: props.location.search,
                showEditTicketDialog: false,
              };
            }

            async loadData() {
              const searchParams = new URLSearchParams(this.state.location);
              const versionId = Number(searchParams.get('version_id'));
              const assigneeId = Number(searchParams.get('assignee_id'));
              let assigneeType = searchParams.get('assignee') as AssigneeType;

              if (assigneeType === null) {
                assigneeType = 'site';
              }
              let franchisee;
              let site;
              let franchiseeId =
                assigneeType === 'franchisee' ? assigneeId : -1;
              let siteId = assigneeType === 'site' ? assigneeId : -1;

              await this.getChecklistTicketsCount(franchiseeId, siteId);
              const checklist = await fetchChecklist(versionId);

              const franchisees = this.props.features.features
                .retailOrganisation
                ? { franchisees: [] }
                : {
                    franchisees: await fetchFranchisees([
                      'email',
                      'attributes',
                    ]),
                  };
              const formattedSites = await fetchSites([
                'franchisee',
                'email',
                'attributes',
              ]).then((res) => {
                return res.map((e) => {
                  return {
                    ...e,
                    franchiseeName: e?.franchisee?.name,
                  };
                });
              });
              const sites = {
                sites: formattedSites,
              } as ISites;
              let renderProps;

              if (assigneeType === 'franchisee') {
                franchisee = franchisees.franchisees.find(
                  (fr) => fr.id === assigneeId
                );
                initNewChecklistData(checklist, {
                  assigneeType: 'franchisee',
                  franchisee,
                });

                renderProps = getRenderProps({
                  template: checklist,
                  assigneeType: 'franchisee',
                  assigneeAttributes: franchisee!.attributes,
                });

                //update question numbers (Q1, Q2, Q3, etc...) for conditional questions
                renderProps = updateQuestionNumbers(checklist, renderProps!);
              } else {
                // site = await fetchSite(assigneeId)
                site = sites.sites.find((st) => st.id === assigneeId);
                initNewChecklistData(checklist, {
                  assigneeType: 'site',
                  site,
                });

                renderProps = getRenderProps({
                  template: checklist,
                  assigneeType: 'site',
                  assigneeAttributes: site!.attributes,
                });

                renderProps = updateQuestionNumbers(checklist, renderProps!);
              }
              return this.setState({
                franchisees,
                sites,
                loadStatus: 'loaded',
                checklistInfoResponse: {
                  franchisee,
                  site,
                  checklist,
                },
                assigneeId,
                assigneeType,
                checklist,
                franchisee,
                site,
                renderProps,
              });
            }

            componentDidMount() {
              if (this.state.checklistInfoResponse) {
                this.initFromTemplate();
              } else {
                this.loadData();
              }
            }

            goToHome = () => {
              return {
                to: {
                  pathname: `/complete`,
                  state: {},
                },
              };
            };

            async initFromTemplate() {
              try {
                const checklistInfoResponse = this.state.checklistInfoResponse;
                const checklist = this.state.checklist as IChecklist;
                const assigneeType = checklistInfoResponse.assignee;
                const assigneeId = checklistInfoResponse.assigneeId ?? 0;
                let franchiseeId =
                  assigneeType === 'franchisee' ? assigneeId : -1;
                let siteId = assigneeType === 'site' ? assigneeId : -1;

                await this.getChecklistTicketsCount(franchiseeId, siteId);
                if (this.state.assigneeType === 'franchisee') {
                  const franchisee = checklistInfoResponse.franchisee;
                  //initialize checklist
                  initNewChecklistData(checklist, {
                    assigneeType: 'franchisee',
                    franchisee,
                  });

                  let renderProps = getRenderProps({
                    template: checklist,
                    assigneeType: 'franchisee',
                    assigneeAttributes: franchisee!.attributes,
                  });

                  //update question numbers (Q1, Q2, Q3, etc...) for conditional questions
                  renderProps = updateQuestionNumbers(checklist, renderProps!);
                  this.setState({
                    franchisee,
                    checklist,
                    renderProps,
                  });
                } else if (this.state.assigneeType === 'site') {
                  const site = checklistInfoResponse.site;
                  //initialize checklist
                  initNewChecklistData(checklist, {
                    assigneeType: 'site',
                    site,
                  });

                  let renderProps = getRenderProps({
                    template: checklist,
                    assigneeType: 'site',
                    assigneeAttributes: site!.attributes,
                  });

                  renderProps = updateQuestionNumbers(checklist, renderProps!);
                  this.setState({
                    site,
                    checklist,
                    renderProps,
                  });
                }

                this.setState({
                  loadStatus: 'loaded',
                });

                this.findConditionalRulesFromTemplate();
              } catch (e) {
                console.log(e);
                this.setState({
                  loadStatus: 'load_error',
                });
              }
            }

            findConditionalRulesFromTemplate() {
              this.state.checklist!.groups.forEach((group, groupindex) => {
                group.fields
                  .filter((f) => f.conditionalRule != null)
                  .forEach((field) =>
                    this.conditionalRulesList.push(field.conditionalRule!)
                  );
              });
            }

            getChecklistTicketsCount = async (
              franchiseeId: number,
              siteId: number
            ) => {
              try {
                this.checklistTicketsCount =
                  await this.state.api.getChecklistTicketsCount(
                    franchiseeId,
                    siteId
                  );
              } catch (e) {
                this.checklistTicketsCount = 0;
              }
            };

            // are we going to save locally?
            async save() {
              const checklist = this.state.checklist!;
              validateGroups(checklist, this.state.renderProps!);
              this.setState({
                renderProps: this.state.renderProps,
                disableTabs: false,
              });
            }

            onChecklistChanged = () => {
              // checklist is locked, don't save change
              if (this.state.checklist!.locked) return;

              this.setState({ disableTabs: true });
              this.debouncedSave();
            };

            validateConditionalQuestion = (
              newValue: string,
              question: IChecklistField | null
            ) => {
              if (question == null) {
                // no conditional question change, don't need to refresh page
                this.setState({
                  questionsNeedRefresh: false,
                });
                return;
              }
              const filteredConditionalRules: IChecklistConditionalRule[] = [];
              question.conditions!.forEach((conditionId) => {
                this.conditionalRulesList.forEach(
                  (conditionRule, conditionalRuleIdx) => {
                    conditionRule.conditions!.forEach(
                      (condition, conditionIdx) => {
                        if (condition.id === conditionId) {
                          condition.applied = hasConditionApplied(
                            newValue,
                            question,
                            condition
                          );
                          if (
                            filteredConditionalRules.indexOf(conditionRule) < 0
                          ) {
                            filteredConditionalRules.push(conditionRule);
                          }
                        }
                      }
                    );
                  }
                );
              });
              filteredConditionalRules.forEach((conditionalRule) => {
                this.refreshConditionalRuleAndSubQuestions(conditionalRule);
              });
              // update question number
              const renderProps = updateQuestionNumbers(
                this.state.checklist!,
                this.state.renderProps!
              );
              this.setState({
                questionsNeedRefresh: filteredConditionalRules.length > 0,
                renderProps,
              });
            };

            refreshConditionalRuleAndSubQuestions = (
              conditionalRule: IChecklistConditionalRule
            ) => {
              const currentGroup = findChecklistGroupById(
                conditionalRule.groupId,
                this.state.checklist!
              );
              const showFieldFlag = isConditionalRuleShow(
                conditionalRule,
                this.conditionalRulesList
              );
              currentGroup!.fields.forEach((field) => {
                if (conditionalRule.conditionalQuestions.includes(field.id)) {
                  field.hidden = !showFieldFlag;
                  if (field.type === 'conditionalRule') {
                    this.refreshConditionalRuleAndSubQuestions(
                      field.conditionalRule!
                    );
                  }
                }
              });
            };

            onChecklistSubmit = async () => {
              const errors = validateChecklist(
                this.state.checklist!,
                this.state.renderProps!,
                i18n.t.bind(i18n)
              );
              if (errors && errors.length) {
                const errStrings = errors.map((error: any) => error.errorText);
                this.setState({
                  showValidationErrorDialog: true,
                  validationErrors: errStrings,
                });
                return;
              } else {
                let showIncompleteFields = false;
                this.state.renderProps?.groups.forEach((group) => {
                  if (group.incompleteFields) {
                    showIncompleteFields = true;
                  }
                });
                this.setState({
                  showSubmitDialog: true,
                  incompleteFields: showIncompleteFields,
                });
              }
            };

            onChecklistSubmitted = async (checklistId: number) => {
              let newChecklist = Object.assign({}, this.state.checklist);
              newChecklist.id = checklistId;
              this.setState({
                checklist: newChecklist,
                checklistId,
              });
            };

            onSubmitDialogsCompleted = async () => {
              // re-initialise UI after submit dialog(s) have finished
              await new Promise<void>((resolve) => {
                this.setState(
                  {
                    loadStatus: 'loading',
                    submitted: true,
                  },
                  () => {
                    resolve();
                  }
                );
              });
            };

            showEmailDialog = () => {
              this.setState({ showEmailDialog: true });
            };

            onChecklistReassigned(assignment: IAssignment) {
              if (assignment.assignee === 'franchisee') {
                const franchisee = getFranchisee(
                  this.state.franchisees!,
                  assignment.assigneeId
                );
                updateChecklistAssignee(this.state.checklist!, {
                  assigneeType: 'franchisee',
                  franchisee,
                });
                const renderProps = getRenderProps({
                  template: this.state.checklist!,
                  assigneeType: 'franchisee',
                  assigneeAttributes: franchisee.attributes,
                });

                this.setState({
                  assigneeType: 'franchisee',
                  assigneeId: assignment.assigneeId,
                  franchisee,
                  site: undefined,
                  renderProps,
                });
              } else if (assignment.assignee === 'site') {
                const site = getSite(
                  this.state.sites!.sites,
                  assignment.assigneeId
                );
                updateChecklistAssignee(this.state.checklist!, {
                  assigneeType: 'site',
                  site,
                });
                const renderProps = getRenderProps({
                  template: this.state.checklist!,
                  assigneeType: 'site',
                  assigneeAttributes: site.attributes,
                });
                this.setState({
                  assigneeType: 'site',
                  assigneeId: assignment.assigneeId,
                  franchisee: undefined,
                  site,
                  renderProps,
                });
              }

              this.onChecklistChanged();
              const searchParams = new URLSearchParams(this.state.location);
              let queryStr = '';
              searchParams.forEach((value, key) => {
                let val = value;
                if (key === 'assignee_id')
                  val = assignment.assigneeId.toString();
                if (!queryStr.length) {
                  queryStr += '?' + key + '=' + val;
                } else {
                  queryStr += '&' + key + '=' + val;
                }
              });
              this.props.history.replace({
                pathname: this.props.location.pathname,
                search: queryStr.toString(),
              });
            }

            onNewTicket() {
              this.onTicketPreset(null, {
                priority: 'Medium',
              } as any);
            }
            closeEditTicket = () => {
              this.setState({
                showChecklistTicketsDialog: true,
                showTicketDialog: false,
                showEditTicketDialog: false,
              });
            };

            onTicketPreset(
              question: IChecklistField | null,
              preset: IChecklistTicketJson
            ) {
              let emailTo = '';
              if (this.props.capabilities.updateTicketEmailField) {
                emailTo =
                  this.state.assigneeType === 'franchisee'
                    ? this.state.franchisee!.email
                    : this.state.site!.email;
              }

              this.setState({
                showTicketDialog: true,
                ticketDefaults: {
                  templateName: this.state.checklist!.templateName
                    ? this.state.checklist!.templateName
                    : this.state.checklist!.name,
                  checklistDate: this.state.checklist!.date
                    ? formatDate(
                        'display_date',
                        this.state.checklist!.date,
                        this.props.capabilities.dateFormat
                      )
                    : '',
                  question,
                  emailTo,
                  ...preset,
                },
              });
            }

            onShowTickets = () => {
              this.setState({
                showChecklistTicketsDialog: true,
              });
            };

            gotoTicket = (ticketId: number) => {
              this.setState({
                showChecklistTicketsDialog: false,
                showTicketDialog: false,
                showEditTicketDialog: true,
                ticketId,
              });
            };

            getAssigneeAttributes = ({
              assignee,
              sites,
              assigneeId,
            }: {
              assignee: string;
              sites: ISite[] | null;
              assigneeId: number;
            }): IAttribute[] => {
              if (assignee === 'franchisee') {
                return this.state.franchisee!.attributes;
              }
              if (!sites) {
                return [] as IAttribute[];
              }
              return getSiteAttributes(sites, assigneeId);
            };

            render() {
              const t = (key: string) => {
                return this.props.ctx.i18next.t(key);
              };

              if (this.state.loadStatus === 'loaded') {
                const checklist = this.state.checklist!;
                const franchiseeId =
                  this.state.assigneeType === 'franchisee'
                    ? this.state.franchisee!.id
                    : getSiteFranchiseeId(this.state.site!);

                let content;

                if (checklist.useTabs) {
                  const groupsToShow: IChecklistGroup[] = [];

                  checklist.groups.forEach((group, index) => {
                    if (this.state.renderProps!.groups[index].showTab) {
                      groupsToShow.push(group);
                    }
                  });

                  const tabs: ITabDefinition[] = groupsToShow.map(
                    (group, index) => {
                      // group index is the index in complete groups list
                      // includes show and hidden groups
                      let groupIndex = 0;
                      for (let i = 0; i < checklist.groups.length; i++) {
                        if (checklist.groups[i].id === group.id) {
                          groupIndex = i;
                          break;
                        }
                      }

                      const renderProps =
                        this.state.renderProps!.groups[groupIndex];

                      return {
                        name: 'group_' + index,
                        label: (
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                            }}
                          >
                            {group.label}
                            {!renderProps.incompleteFields && (
                              <CheckCircleCustomColor
                                size={20}
                                background='#ff5983'
                                color='#ffffff'
                              />
                            )}
                          </div>
                        ),
                        component: (
                          <QuestionGroup
                            groupIndex={index}
                            group={group}
                            renderProps={renderProps!}
                            dateTimeFormat={t('dateTimeFormat')}
                            dateFormat={t('dateFormat')}
                            onFieldChange={this.onChecklistChanged}
                            onTicketPreset={() => {}}
                            validateConditionalQuestion={
                              this.validateConditionalQuestion
                            }
                            questionsNeedRefresh={
                              this.state.questionsNeedRefresh
                            }
                            hideGroupPhotos={checklist.hideGroupPhotos}
                            hideQuestionNumber={checklist.hideQuestionNumber}
                            disableTabLinks={this.state.disableTabs}
                          />
                        ),
                      };
                    }
                  );

                  content = (
                    <TabsComponent
                      color='light'
                      compact={true}
                      tabs={tabs}
                      rememberScrollPosition={true}
                      initialTabIdx={0}
                      hasDetailsTab={false}
                      disabled={this.state.disableTabs}
                    />
                  );
                }
                //no tabs
                else {
                  content = checklist.groups.map((group, index) => {
                    const renderProps = this.state.renderProps!.groups[index];
                    return (
                      renderProps.showTab && (
                        <div key={group.id}>
                          <Typography
                            variant='h5'
                            className={this.props.classes.groupHeader}
                          >
                            {group.label}
                          </Typography>
                          <QuestionGroup
                            groupIndex={index}
                            group={group}
                            renderProps={renderProps}
                            onFieldChange={this.onChecklistChanged}
                            onTicketPreset={() => {}}
                            validateConditionalQuestion={
                              this.validateConditionalQuestion
                            }
                            questionsNeedRefresh={
                              this.state.questionsNeedRefresh
                            }
                            dateTimeFormat={t('dateTimeFormat')}
                            dateFormat={t('dateFormat')}
                            hideGroupPhotos={checklist.hideGroupPhotos}
                            hideQuestionNumber={checklist.hideQuestionNumber}
                            disableTabLinks={false}
                          />
                        </div>
                      )
                    );
                  });
                }
                const assigneeTypeLabel =
                  this.state.assigneeType === 'franchisee'
                    ? t('customLabel_franchisee')
                    : t('customLabel_site');
                const assigneeName =
                  this.state.assigneeType === 'franchisee'
                    ? this.state.franchisee!.name
                    : this.state.site!.name;

                const checklistHeader = (
                  <div className={this.props.classes.checklistInfo}>
                    <div className={this.props.classes.checklistHeader}>
                      <div>
                        <Typography variant='h5' color='inherit'>
                          {checklist.name}
                        </Typography>
                      </div>
                      <ChecklistActions
                        checklistId={this.state.checklistId}
                        checklist={this.state.checklist!}
                        capabilities={this.props.capabilities}
                        franchisees={this.state.franchisees!}
                        sites={this.state.sites!}
                        defaultAssigneeType={this.state.assigneeType}
                        onChecklistReassigned={this.onChecklistReassigned}
                        onNewTicket={this.onNewTicket}
                        onShowTickets={this.onShowTickets}
                        checklistTicketsCount={this.checklistTicketsCount}
                        franchisee={this.state.franchisee}
                        site={this.state.site}
                      />
                    </div>
                    <Typography variant='body1' color='inherit'>
                      {assigneeTypeLabel + ': ' + assigneeName}
                    </Typography>
                  </div>
                );

                return (
                  <ThemeProvider theme={oneplaceThemeSecondary}>
                    <ChecklistHeader
                      onSubmitChecklist={this.onChecklistSubmit}
                    />
                    <div
                      id='checklist'
                      className={this.props.classes.appWrapper}
                    >
                      {checklistHeader}
                      {content}
                      {this.state.showTicketDialog && (
                        <NewTicketDialog
                          isOpen={this.state.showTicketDialog}
                          api={this.state.api}
                          capabilities={this.props.capabilities}
                          checklist={this.state.checklist!}
                          imageStorage={this.props.ctx.imageStorage}
                          franchiseeId={franchiseeId}
                          site={this.state.site}
                          franchisee={this.state.franchisee}
                          defaults={this.state.ticketDefaults!}
                          onClose={() => {
                            this.setState({
                              showTicketDialog: false,
                            });
                          }}
                          checklistProps={{
                            assignee: this.state.assigneeType,
                            assigneeAttributes: this.getAssigneeAttributes({
                              assignee: this.state.assigneeType,
                              sites: this.state.sites?.sites || null,
                              assigneeId: this.state.assigneeId,
                            }),
                          }}
                          assigneeLabel={`${assigneeTypeLabel}: ${assigneeName}`}
                          onCloseTicketPopDialog={() => {
                            this.setState({
                              showTicketDialog: !this.state.showTicketDialog,
                            });
                          }}
                        />
                      )}
                      {this.state.showEditTicketDialog && (
                        <EditTicketDialog
                          isOpen={this.state.showEditTicketDialog}
                          api={this.state.api}
                          imageStorage={this.props.ctx.imageStorage}
                          franchiseeId={franchiseeId}
                          ticketId={
                            this.state.ticketId ? this.state.ticketId : -1
                          }
                          onClose={this.closeEditTicket}
                          capabilities={this.props.capabilities}
                        />
                      )}

                      {this.state.showChecklistTicketsDialog && (
                        <ChecklistTicketsDialog
                          isOpen={this.state.showChecklistTicketsDialog}
                          api={this.state.api}
                          imageStorage={this.props.ctx.imageStorage}
                          franchiseeId={
                            this.state.franchisee
                              ? this.state.franchisee.id
                              : -1
                          }
                          siteId={this.state.site ? this.state.site.id : -1}
                          entityName={
                            this.state.site
                              ? this.state.site.name
                              : this.state.franchisee!.name
                          }
                          onClose={() => {
                            this.setState({
                              showChecklistTicketsDialog: false,
                            });
                          }}
                          gotoTicket={this.gotoTicket}
                          capabilities={this.props.capabilities}
                        />
                      )}

                      <ChecklistFooter
                        isSubmitDialogOpen={this.state.showSubmitDialog}
                        api={this.state.api}
                        checklistInfoResponse={this.state.checklistInfoResponse}
                        respondent={this.respondent}
                        assigneeType={this.state.assigneeType}
                        franchisee={this.state.franchisee}
                        site={this.state.site}
                        onCloseSubmitDialog={() => {
                          this.setState({
                            showSubmitDialog: false,
                          });
                        }}
                        onChecklistSubmitted={this.onChecklistSubmitted}
                        onSubmitDialogsCompleted={this.onSubmitDialogsCompleted}
                        errorsShown={this.state.showValidationErrorDialog}
                        errors={this.state.validationErrors}
                        onErrorsDismissed={() => {
                          this.setState({
                            showValidationErrorDialog: false,
                          });
                        }}
                        showEmailDialog={this.showEmailDialog}
                        isShowEmailDialog={this.state.showEmailDialog}
                        incompleteFields={this.state.incompleteFields}
                        franchiseeId={franchiseeId}
                        onCloseEmailDialog={() => {
                          this.setState({
                            showEmailDialog: false,
                          });
                        }}
                        capabilities={this.props.capabilities}
                        // goHome={this.props.nav.goBack}
                      />
                    </div>
                  </ThemeProvider>
                );
                // } else if (this.state.submitted) {
                //     return <Redirect {...this.goToHome()} />
              } else if (this.state.redirectToHome) {
                return <Redirect {...this.state.redirectToHome} />;
              }

              return null;
            }
          }
        )
      )
    )
  )
);
