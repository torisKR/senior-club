import type { PropsWithChildren } from 'react';
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { AppState } from 'react-native';

import { apiErrorMessage } from '@/api/error-message';
import { accountApi } from '@/api/account-api';
import {
  eventsApi,
  mergeEventPages,
  toParticipation,
  type ApiApplication,
} from '@/api/events-api';
import { profileApi, type ProfileStateSnapshot } from '@/api/profile-api';
import {
  authRestoreRetryDelay,
  isRetryableAuthRestoreError,
} from '@/auth/auth-restore-retry';
import { requestKakaoAccessToken } from '@/auth/kakao-login';
import { authSessionManager } from '@/auth/auth-session-manager';
import { unregisterCurrentAndroidDevice } from '@/notifications/push-registration';
import {
  createDefaultAppState,
  normalizePersistedAppState,
} from '@/context/persisted-app-state';
import type {
  AppStateContextValue,
  AuthSession,
  EmailCodeRequestInput,
  EmailCodeVerificationInput,
  EntityId,
  EventFeedState,
  EventListView,
  Interest,
  KakaoLoginInput,
  ParticipationStatus,
  PersistedAppState,
  PhoneCodeRequestInput,
  PhoneCodeVerificationInput,
  User,
} from '@/types';
import { storage } from '@/utils/storage';

// Legacy fixture notification/review/chat fields are ignored while server APIs remain authoritative.
export const APP_STATE_STORAGE_KEY = 'senior-club.app-state.v4';

function userForSession(session: AuthSession): User {
  return {
    id: session.userId,
    email: session.email,
    phoneNumber: session.phoneNumber ?? null,
    name: session.displayName,
    role: session.role,
    ageGroup: '미설정',
    region: '',
    interestIds: [],
    joinedClubIds: [],
  };
}

const defaultState = createDefaultAppState();
const defaultSnapshot = JSON.stringify(defaultState);

type EventFeeds = Record<EventListView, EventFeedState>;
type EventLoadMode = 'replace' | 'append';

function emptyEventFeed(loading = false): EventFeedState {
  return {
    events: [],
    loaded: false,
    loading,
    loadingMore: false,
    error: null,
    errorMode: null,
    nextCursor: null,
    hasNextPage: false,
  };
}

function createInitialEventFeeds(): EventFeeds {
  return {
    upcoming: emptyEventFeed(true),
    past: emptyEventFeed(),
  };
}

function releaseApprovedSeat(feed: EventFeedState, eventId: EntityId): EventFeedState {
  let changed = false;
  const events = feed.events.map((event) => {
    if (event.id !== eventId) return event;
    changed = true;
    return {
      ...event,
      participantCount: Math.max(0, event.participantCount - 1),
      lifecycle: event.lifecycle === 'full' ? ('upcoming' as const) : event.lifecycle,
    };
  });
  return changed ? { ...feed, events } : feed;
}

function parseSnapshot(snapshot: string | null): PersistedAppState {
  if (!snapshot) {
    return createDefaultAppState();
  }

  try {
    return normalizePersistedAppState(JSON.parse(snapshot) as unknown);
  } catch {
    return createDefaultAppState();
  }
}

export const AppStateContext = createContext<AppStateContextValue | undefined>(undefined);

export function AppStateProvider({ children }: PropsWithChildren) {
  const [isHydrated, setIsHydrated] = useState(false);
  const [authRestoreError, setAuthRestoreError] = useState<string | null>(null);
  const [eventFeeds, setEventFeeds] = useState<EventFeeds>(createInitialEventFeeds);
  const [availableInterests, setAvailableInterests] = useState<Interest[]>([]);
  const [interestsLoading, setInterestsLoading] = useState(true);
  const [interestsError, setInterestsError] = useState<string | null>(null);
  const snapshot = useSyncExternalStore(
    useCallback((listener: () => void) => storage.subscribe(APP_STATE_STORAGE_KEY, listener), []),
    useCallback(() => storage.getRaw(APP_STATE_STORAGE_KEY), []),
    useCallback(() => defaultSnapshot, []),
  );
  const state = useMemo(() => parseSnapshot(snapshot), [snapshot]);
  const authenticatedUserId = state.session?.userId;
  const profileMutationVersion = useRef(0);
  const participationMutationVersion = useRef(0);
  const interestsLoadInFlight = useRef<Promise<void> | null>(null);
  const eventFeedsRef = useRef(eventFeeds);
  const eventRequestVersions = useRef<Record<EventListView, number>>({ upcoming: 0, past: 0 });
  const eventRequestControllers = useRef<Record<EventListView, AbortController | null>>({
    upcoming: null,
    past: null,
  });
  const eventRequestPromises = useRef<Record<EventListView, Promise<void> | null>>({
    upcoming: null,
    past: null,
  });

  const updateEventFeeds = useCallback((updater: (current: EventFeeds) => EventFeeds) => {
    setEventFeeds((current) => {
      const next = updater(current);
      eventFeedsRef.current = next;
      return next;
    });
  }, []);

  const updateState = useCallback(
    (updater: (current: PersistedAppState) => PersistedAppState) =>
      storage.update(APP_STATE_STORAGE_KEY, createDefaultAppState(), (current) =>
        normalizePersistedAppState(updater(normalizePersistedAppState(current))),
      ),
    [],
  );

  const syncAuthenticatedSession = useCallback(
    (session: AuthSession) => {
      updateState((current) => ({
        ...current,
        session,
        onboardingCompleted:
          session.onboardingCompletedAt !== null ||
          (current.user.id === session.userId && current.onboardingCompleted),
        selectedInterestIds:
          current.user.id === session.userId ? current.selectedInterestIds : [],
        user:
          current.user.id === session.userId
            ? {
                ...current.user,
                email: session.email,
                phoneNumber: session.phoneNumber ?? null,
                name: session.displayName,
                role: session.role,
              }
            : userForSession(session),
      }));
    },
    [updateState],
  );

  const applyServerProfile = useCallback(
    (profile: ProfileStateSnapshot, expectedUserId: string) => {
      if (profile.user.id !== expectedUserId) {
        return false;
      }

      let applied = false;
      updateState((current) => {
        if (current.session?.userId !== expectedUserId) {
          return current;
        }
        applied = true;
        return {
          ...current,
          session: {
            ...current.session,
            displayName: profile.user.name,
            onboardingCompletedAt: profile.onboardingCompletedAt,
          },
          user: profile.user,
          selectedInterestIds: [...profile.selectedInterestIds],
          onboardingCompleted: profile.onboardingCompleted,
        };
      });
      return applied;
    },
    [updateState],
  );

  useEffect(() => {
    let active = true;
    const unsubscribe = authSessionManager.subscribe((authSnapshot) => {
      if (!active) return;
      setAuthRestoreError(
        authSnapshot.restoreError
          ? apiErrorMessage(authSnapshot.restoreError, '로그인 상태를 복원하지 못했습니다.')
          : null,
      );
      if (authSnapshot.session) {
        syncAuthenticatedSession(authSnapshot.session);
      } else if (authSnapshot.status === 'anonymous') {
        updateState((current) => ({ ...current, session: null }));
      }
    });

    authSessionManager
      .restore()
      .then((restoredSession) => {
        if (active && restoredSession) {
          syncAuthenticatedSession(restoredSession);
        }
      })
      .finally(() => {
        if (active) setIsHydrated(true);
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [syncAuthenticatedSession, updateState]);

  useEffect(() => {
    let active = true;
    let retryInFlight = false;
    let retryableFailure = false;
    let failedAttempts = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const clearRetryTimer = () => {
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    };

    const scheduleRetry = (delay: number) => {
      if (!active || retryInFlight || retryTimer) return;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        void attemptRestore();
      }, delay);
    };

    const handleRetryableFailure = () => {
      retryableFailure = true;
      failedAttempts += 1;
      const delay = authRestoreRetryDelay(failedAttempts);
      if (delay !== null) scheduleRetry(delay);
    };

    const attemptRestore = async () => {
      if (!active || retryInFlight || !retryableFailure) return;
      retryInFlight = true;
      try {
        await authSessionManager.restore();
        const authSnapshot = authSessionManager.getSnapshot();
        if (authSnapshot.status === 'authenticated') {
          retryableFailure = false;
          failedAttempts = 0;
          clearRetryTimer();
        } else if (isRetryableAuthRestoreError(authSnapshot.restoreError)) {
          handleRetryableFailure();
        } else {
          retryableFailure = false;
          clearRetryTimer();
        }
      } finally {
        retryInFlight = false;
      }
    };

    const unsubscribe = authSessionManager.subscribe((authSnapshot) => {
      if (!active) return;
      if (authSnapshot.status === 'authenticated') {
        retryableFailure = false;
        failedAttempts = 0;
        clearRetryTimer();
        return;
      }
      if (authSnapshot.status !== 'anonymous') return;

      const shouldRetry = isRetryableAuthRestoreError(authSnapshot.restoreError);
      retryableFailure = shouldRetry;
      if (!shouldRetry) {
        failedAttempts = 0;
        clearRetryTimer();
      } else if (!retryInFlight && failedAttempts === 0) {
        handleRetryableFailure();
      }
    });

    const currentSnapshot = authSessionManager.getSnapshot();
    if (
      currentSnapshot.status === 'anonymous' &&
      isRetryableAuthRestoreError(currentSnapshot.restoreError)
    ) {
      handleRetryableFailure();
    }

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (
        nextState !== 'active' ||
        !active ||
        !retryableFailure ||
        retryInFlight ||
        retryTimer
      ) {
        return;
      }

      failedAttempts = 0;
      scheduleRetry(1_000);
    });

    return () => {
      active = false;
      clearRetryTimer();
      appStateSubscription.remove();
      unsubscribe();
    };
  }, []);

  const requestEventView = useCallback(
    (view: EventListView, mode: EventLoadMode): Promise<void> => {
      const activeRequest = eventRequestPromises.current[view];
      if (mode === 'append' && activeRequest) {
        return activeRequest;
      }

      const snapshot = eventFeedsRef.current[view];
      const cursor = mode === 'append' ? (snapshot.nextCursor ?? undefined) : undefined;
      if (mode === 'append' && (!snapshot.loaded || !snapshot.hasNextPage || !cursor)) {
        return Promise.resolve();
      }

      if (mode === 'replace') {
        eventRequestControllers.current[view]?.abort();
      }

      const controller = new AbortController();
      const version = eventRequestVersions.current[view] + 1;
      eventRequestVersions.current[view] = version;
      eventRequestControllers.current[view] = controller;

      updateEventFeeds((current) => ({
        ...current,
        [view]: {
          ...current[view],
          loading: mode === 'replace',
          loadingMore: mode === 'append',
          error: null,
          errorMode: null,
        },
      }));

      const request = (async () => {
        try {
          const response = await eventsApi.list({ view, cursor, signal: controller.signal });
          if (
            controller.signal.aborted ||
            eventRequestVersions.current[view] !== version ||
            eventRequestControllers.current[view] !== controller
          ) {
            return;
          }

          updateEventFeeds((current) => ({
            ...current,
            [view]: {
              events:
                mode === 'append'
                  ? mergeEventPages(current[view].events, response.data)
                  : mergeEventPages([], response.data),
              loaded: true,
              loading: false,
              loadingMore: false,
              error: null,
              errorMode: null,
              nextCursor:
                response.page.hasNextPage && response.page.nextCursor
                  ? response.page.nextCursor
                  : null,
              hasNextPage: Boolean(
                response.page.hasNextPage && response.page.nextCursor,
              ),
            },
          }));
        } catch (error) {
          if (
            controller.signal.aborted ||
            eventRequestVersions.current[view] !== version ||
            eventRequestControllers.current[view] !== controller
          ) {
            return;
          }

          updateEventFeeds((current) => ({
            ...current,
            [view]: {
              ...current[view],
              loading: false,
              loadingMore: false,
              error: apiErrorMessage(
                error,
                view === 'upcoming'
                  ? '예정 모임을 불러오지 못했습니다.'
                  : '지난 모임을 불러오지 못했습니다.',
              ),
              errorMode: mode,
            },
          }));
        } finally {
          if (eventRequestControllers.current[view] === controller) {
            eventRequestControllers.current[view] = null;
            eventRequestPromises.current[view] = null;
          }
        }
      })();

      eventRequestPromises.current[view] = request;
      return request;
    },
    [updateEventFeeds],
  );

  const ensureEventView = useCallback(
    (view: EventListView) => {
      const snapshot = eventFeedsRef.current[view];
      if (snapshot.loaded) return Promise.resolve();
      return eventRequestPromises.current[view] ?? requestEventView(view, 'replace');
    },
    [requestEventView],
  );

  const reloadEventView = useCallback(
    (view: EventListView) => requestEventView(view, 'replace'),
    [requestEventView],
  );

  const loadMoreEventView = useCallback(
    (view: EventListView) => requestEventView(view, 'append'),
    [requestEventView],
  );

  const loadInterests = useCallback((signal?: AbortSignal) => {
    if (interestsLoadInFlight.current) {
      return interestsLoadInFlight.current;
    }

    const request = (async () => {
      await Promise.resolve();
      if (signal?.aborted) return;
      setInterestsLoading(true);
      setInterestsError(null);
      try {
        setAvailableInterests(await profileApi.listInterests(signal));
      } catch (error) {
        if (signal?.aborted) return;
        setInterestsError(apiErrorMessage(error, '관심사 목록을 불러오지 못했습니다.'));
      } finally {
        if (!signal?.aborted) setInterestsLoading(false);
      }
    })().finally(() => {
      if (interestsLoadInFlight.current === request) {
        interestsLoadInFlight.current = null;
      }
    });
    interestsLoadInFlight.current = request;
    return request;
  }, []);

  useEffect(() => {
    const requestControllers = eventRequestControllers.current;
    const requestPromises = eventRequestPromises.current;
    const requestVersions = eventRequestVersions.current;
    const task = setTimeout(() => void ensureEventView('upcoming'), 0);
    return () => {
      clearTimeout(task);
      for (const view of ['upcoming', 'past'] as const) {
        requestControllers[view]?.abort();
        requestControllers[view] = null;
        requestPromises[view] = null;
        requestVersions[view] += 1;
      }
    };
  }, [ensureEventView]);

  useEffect(() => {
    const controller = new AbortController();
    const task = setTimeout(() => void loadInterests(controller.signal), 0);
    return () => {
      clearTimeout(task);
      controller.abort();
    };
  }, [loadInterests]);

  useEffect(() => {
    if (!isHydrated || !authenticatedUserId) {
      return;
    }

    const controller = new AbortController();
    const mutationVersion = profileMutationVersion.current;
    profileApi
      .me(controller.signal)
      .then((profile) => {
        if (
          !controller.signal.aborted &&
          mutationVersion === profileMutationVersion.current
        ) {
          applyServerProfile(profile, authenticatedUserId);
        }
      })
      .catch(() => {
        // The authenticated client clears invalid credentials on 401. Retryable failures keep
        // the last server-backed local profile as an offline UI cache.
      });

    return () => controller.abort();
  }, [applyServerProfile, authenticatedUserId, isHydrated]);

  const requestEmailCode = useCallback(
    (input: EmailCodeRequestInput) => authSessionManager.requestEmailCode(input),
    [],
  );

  const requestPhoneCode = useCallback(
    (input: PhoneCodeRequestInput) => authSessionManager.requestPhoneCode(input),
    [],
  );

  const signIn = useCallback(
    async (input: EmailCodeVerificationInput) => {
      const session = await authSessionManager.verifyEmailCode(input);
      syncAuthenticatedSession(session);
      return session;
    },
    [syncAuthenticatedSession],
  );

  const signInWithPhone = useCallback(
    async (input: PhoneCodeVerificationInput) => {
      const session = await authSessionManager.verifyPhoneCode(input);
      syncAuthenticatedSession(session);
      return session;
    },
    [syncAuthenticatedSession],
  );

  const signInWithKakao = useCallback(
    async (input: KakaoLoginInput) => {
      const accessToken = await requestKakaoAccessToken();
      const session = await authSessionManager.loginWithKakao(accessToken, input);
      syncAuthenticatedSession(session);
      return session;
    },
    [syncAuthenticatedSession],
  );

  const signOut = useCallback(async () => {
    const unregisterDevice = unregisterCurrentAndroidDevice();
    updateState((current) => ({ ...current, session: null }));
    await unregisterDevice.catch(() => undefined);
    await authSessionManager.logout();
  }, [updateState]);

  const deleteAccount = useCallback(async (reason?: string) => {
    const deletionRequest = await accountApi.requestDeletion(reason);
    await unregisterCurrentAndroidDevice().catch(() => undefined);
    await authSessionManager.logout();
    storage.remove(APP_STATE_STORAGE_KEY);
    return deletionRequest;
  }, []);

  const setLargeTextEnabled = useCallback(
    (enabled: boolean) => updateState((current) => ({ ...current, largeTextEnabled: enabled })),
    [updateState],
  );

  const toggleLargeText = useCallback(
    () => updateState((current) => ({ ...current, largeTextEnabled: !current.largeTextEnabled })),
    [updateState],
  );

  const setInterestSelected = useCallback(
    (interestId: EntityId, selected: boolean) =>
      updateState((current) => {
        const nextIds = selected
          ? Array.from(new Set([...current.selectedInterestIds, interestId]))
          : current.selectedInterestIds.filter((id) => id !== interestId);

        return {
          ...current,
          selectedInterestIds: nextIds,
          user: { ...current.user, interestIds: nextIds },
        };
      }),
    [updateState],
  );

  const toggleInterest = useCallback(
    (interestId: EntityId) =>
      updateState((current) => {
        const isSelected = current.selectedInterestIds.includes(interestId);
        const nextIds = isSelected
          ? current.selectedInterestIds.filter((id) => id !== interestId)
          : [...current.selectedInterestIds, interestId];

        return {
          ...current,
          selectedInterestIds: nextIds,
          user: { ...current.user, interestIds: nextIds },
        };
      }),
    [updateState],
  );

  const replaceInterests = useCallback(
    (interestIds: EntityId[]) =>
      updateState((current) => {
        const nextIds = Array.from(new Set(interestIds));
        return {
          ...current,
          selectedInterestIds: nextIds,
          user: { ...current.user, interestIds: nextIds },
        };
      }),
    [updateState],
  );

  const completeOnboarding = useCallback(
    async (profile: Parameters<typeof profileApi.update>[0]) => {
      if (!authenticatedUserId) {
        throw new Error('로그인이 필요합니다.');
      }

      const nextProfile = await profileApi.update(profile);
      profileMutationVersion.current += 1;
      if (!applyServerProfile(nextProfile, authenticatedUserId)) {
        throw new Error('로그인 회원과 프로필 응답이 일치하지 않습니다.');
      }
    },
    [applyServerProfile, authenticatedUserId],
  );

  const updateUser = useCallback(
    (updates: Partial<User>) =>
      updateState((current) => {
        const nextUser = { ...current.user, ...updates };
        return {
          ...current,
          user: nextUser,
          selectedInterestIds: updates.interestIds ? [...updates.interestIds] : current.selectedInterestIds,
        };
      }),
    [updateState],
  );

  const syncApplication = useCallback(
    (
      application: ApiApplication | null,
      eventId: EntityId,
      expectedUserId?: EntityId,
    ) => {
      const nextParticipation = application ? toParticipation(application) : null;
      let applied = false;
      updateState((current) => {
        if (expectedUserId && current.session?.userId !== expectedUserId) {
          return current;
        }
        applied = true;
        return {
          ...current,
          participations: nextParticipation
            ? [
                ...current.participations.filter(
                  (participation) =>
                    participation.eventId !== eventId ||
                    participation.userId !== nextParticipation.userId,
                ),
                nextParticipation,
              ]
            : current.participations.filter(
                (participation) =>
                  participation.eventId !== eventId ||
                  participation.userId !== current.session?.userId,
              ),
        };
      });
      return applied ? nextParticipation?.status : undefined;
    },
    [updateState],
  );

  const applyToEvent = useCallback(
    async (eventId: EntityId): Promise<ParticipationStatus> => {
      if (!authenticatedUserId) {
        throw new Error('로그인이 필요합니다.');
      }
      participationMutationVersion.current += 1;
      try {
        const application = await eventsApi.apply(eventId);
        const status = syncApplication(application, eventId, authenticatedUserId);
        if (!status) {
          throw new Error('서버에서 신청 상태를 확인하지 못했습니다.');
        }
        return status;
      } finally {
        participationMutationVersion.current += 1;
      }
    },
    [authenticatedUserId, syncApplication],
  );

  const refreshEventParticipation = useCallback(
    async (eventId: EntityId, signal?: AbortSignal) => {
      if (!authenticatedUserId) {
        syncApplication(null, eventId);
        return undefined;
      }
      const expectedUserId = authenticatedUserId;
      const mutationVersion = participationMutationVersion.current;
      const application = await eventsApi.myApplication(eventId, signal);
      if (signal?.aborted || mutationVersion !== participationMutationVersion.current) {
        return undefined;
      }
      return syncApplication(application, eventId, expectedUserId);
    },
    [authenticatedUserId, syncApplication],
  );

  const setParticipationStatus = useCallback(
    (eventId: EntityId, status: ParticipationStatus) => {
      participationMutationVersion.current += 1;
      updateState((current) => {
        if (!current.session) {
          return current;
        }

        const now = new Date().toISOString();
        const existing = current.participations.find(
          (participation) =>
            participation.eventId === eventId && participation.userId === current.session?.userId,
        );
        const nextParticipation = existing
          ? { ...existing, status, updatedAt: now }
          : {
              id: `participation-${eventId}-${Date.now()}`,
              eventId,
              userId: current.session.userId,
              status,
              appliedAt: now,
              updatedAt: now,
            };

        return {
          ...current,
          participations: existing
            ? current.participations.map((participation) =>
                participation.eventId === eventId &&
                participation.userId === current.session?.userId
                  ? nextParticipation
                  : participation,
              )
            : [...current.participations, nextParticipation],
        };
      });
    },
    [updateState],
  );

  const cancelEvent = useCallback(
    async (eventId: EntityId) => {
      if (!authenticatedUserId) {
        throw new Error('로그인이 필요합니다.');
      }
      const expectedUserId = authenticatedUserId;
      const wasApproved = state.participations.some(
        (participation) =>
          participation.eventId === eventId &&
          participation.userId === expectedUserId &&
          participation.status === 'approved',
      );
      participationMutationVersion.current += 1;
      try {
        const application = await eventsApi.cancel(eventId);
        syncApplication(application, eventId, expectedUserId);
        if (wasApproved) {
          updateEventFeeds((current) => ({
            upcoming: releaseApprovedSeat(current.upcoming, eventId),
            past: releaseApprovedSeat(current.past, eventId),
          }));
        }
      } finally {
        participationMutationVersion.current += 1;
      }
    },
    [authenticatedUserId, state.participations, syncApplication, updateEventFeeds],
  );

  const markAttended = useCallback(
    (eventId: EntityId) => {
      setParticipationStatus(eventId, 'attended');
    },
    [setParticipationStatus],
  );

  const participationStatusByEventId = useMemo(() => {
    const statusByEventId = new Map<EntityId, ParticipationStatus>();
    if (!state.session) {
      return statusByEventId;
    }

    for (const participation of state.participations) {
      if (participation.userId === state.session.userId) {
        statusByEventId.set(participation.eventId, participation.status);
      }
    }
    return statusByEventId;
  }, [state.participations, state.session]);

  const getParticipationStatus = useCallback(
    (eventId: EntityId) => participationStatusByEventId.get(eventId),
    [participationStatusByEventId],
  );

  useEffect(() => {
    const userId = state.session?.userId;
    if (!isHydrated || !userId) {
      return;
    }

    const controller = new AbortController();
    const mutationVersion = participationMutationVersion.current;
    eventsApi
      .myApplications(controller.signal)
      .then((applications) => {
        if (
          controller.signal.aborted ||
          mutationVersion !== participationMutationVersion.current
        ) {
          return;
        }
        const nextParticipations = applications
          .map(toParticipation)
          .filter((participation): participation is NonNullable<typeof participation> =>
            Boolean(participation),
          );
        updateState((current) =>
          current.session?.userId === userId
            ? {
                ...current,
                participations: [
                  ...current.participations.filter(
                    (participation) => participation.userId !== userId,
                  ),
                  ...nextParticipations,
                ],
              }
            : current,
        );
      })
      .catch(() => {
        // A detail screen can retry explicitly. Transient refresh failures preserve the session.
      });

    return () => controller.abort();
  }, [isHydrated, state.session?.userId, updateState]);

  const resetDemo = useCallback(
    () =>
      updateState((current) => {
        return current.session
          ? { ...current, participations: [] }
          : {
              ...createDefaultAppState(),
              largeTextEnabled: current.largeTextEnabled,
            };
      }),
    [updateState],
  );

  const availableEvents = useMemo(
    () => mergeEventPages(eventFeeds.upcoming.events, eventFeeds.past.events),
    [eventFeeds.past.events, eventFeeds.upcoming.events],
  );

  const value = useMemo<AppStateContextValue>(() => {
    const visibleParticipations = state.session
      ? state.participations.filter(
          (participation) => participation.userId === state.session?.userId,
        )
      : [];
    const visibleState: PersistedAppState = {
      ...state,
      selectedInterestIds: state.session ? state.selectedInterestIds : [],
      participations: visibleParticipations,
    };

    return {
      ...visibleState,
      isHydrated,
      isAuthenticated: state.session !== null,
      authRestoreError,
      eventsLoading: eventFeeds.upcoming.loading,
      eventsError: eventFeeds.upcoming.error,
      interestsLoading,
      interestsError,
      state: visibleState,
      profile: state.user,
      events: availableEvents,
      upcomingEvents: eventFeeds.upcoming.events,
      pastEvents: eventFeeds.past.events,
      eventFeeds,
      clubs: [],
      interests: availableInterests,
      setProfile: updateUser,
      requestEmailCode,
      requestPhoneCode,
      signIn,
      signInWithKakao,
      signInWithPhone,
      signOut,
      deleteAccount,
      applyEvent: applyToEvent,
      cancelEvent,
      markAttended,
      setLargeText: setLargeTextEnabled,
      resetSession: signOut,
      setLargeTextEnabled,
      toggleLargeText,
      setInterestSelected,
      toggleInterest,
      replaceInterests,
      completeOnboarding,
      updateUser,
      applyToEvent,
      refreshEventParticipation,
      setParticipationStatus,
      getParticipationStatus,
      resetDemo,
      ensureEventView,
      reloadEventView,
      loadMoreEventView,
      reloadEvents: () => reloadEventView('upcoming'),
      reloadInterests: () => loadInterests(),
    };
  },
    [
      state,
      isHydrated,
      authRestoreError,
      eventFeeds,
      interestsLoading,
      interestsError,
      availableEvents,
      availableInterests,
      requestEmailCode,
      requestPhoneCode,
      signIn,
      signInWithKakao,
      signInWithPhone,
      signOut,
      deleteAccount,
      setLargeTextEnabled,
      toggleLargeText,
      setInterestSelected,
      toggleInterest,
      replaceInterests,
      completeOnboarding,
      updateUser,
      applyToEvent,
      refreshEventParticipation,
      setParticipationStatus,
      cancelEvent,
      markAttended,
      getParticipationStatus,
      resetDemo,
      ensureEventView,
      reloadEventView,
      loadMoreEventView,
      loadInterests,
    ],
  );

  return <AppStateContext value={value}>{children}</AppStateContext>;
}
