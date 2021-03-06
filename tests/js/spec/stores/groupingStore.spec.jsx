0; /* eslint-env jest */
import GroupingStore from 'app/stores/groupingStore';
import {Client} from 'app/api';
jest.mock('app/api');

/*
expect.extend({
  toHaveBeenLastCalledWithMatch(received, arg) {
    console.log(this, received, arg);
  }
});
 */

describe('Grouping Store', function() {
  let trigger;
  beforeEach(function() {
    trigger = jest.spyOn(GroupingStore, 'trigger');
    // this.sandbox = sinon.sandbox.create();
    Client.clearMockResponses();
    Client.addMockResponse({
      url: '/issues/groupId/hashes/',
      body: [
        {
          latestEvent: {
            eventID: 'event-1'
          },
          state: 'locked',
          id: '1'
        },
        {
          latestEvent: {
            eventID: 'event-2'
          },
          state: 'unlocked',
          id: '2'
        },
        {
          latestEvent: {
            eventID: 'event-3'
          },
          state: 'unlocked',
          id: '3'
        },
        {
          latestEvent: {
            eventID: 'event-4'
          },
          state: 'unlocked',
          id: '4'
        },
        {
          latestEvent: {
            eventID: 'event-5'
          },
          state: 'locked',
          id: '5'
        }
      ]
    });
    Client.addMockResponse({
      url: '/issues/groupId/similar/',
      body: [
        [
          {
            id: '274'
          },
          {
            'exception:stacktrace:pairs': 0.375,
            'exception:stacktrace:application-chunks': 0.175,
            'message:message:character-shingles': 0.775
          }
        ],
        [
          {
            id: '275'
          },
          {'exception:stacktrace:pairs': 1.000}
        ],
        [
          {
            id: '216'
          },
          {
            'exception:stacktrace:application-chunks': 0.000235,
            'exception:stacktrace:pairs': 0.001488
          }
        ]
      ]
    });
  });

  afterEach(function() {
    // this.sandbox.restore();
    trigger.mockReset();
  });

  describe('onFetch()', function() {
    it('initially gets called with correct state values', function() {
      GroupingStore.onFetch([]);

      expect(trigger).toBeCalled();
      expect(trigger).toBeCalledWith(
        expect.objectContaining({
          error: false,
          filteredSimilarItems: [],
          loading: true,
          mergeState: new Map(),
          mergedItems: [],
          mergedLinks: '',
          similarItems: [],
          similarLinks: '',
          unmergeState: new Map()
        })
      );
    });

    it('fetches list of similar items', async function() {
      await GroupingStore.onFetch([
        {dataKey: 'similar', endpoint: '/issues/groupId/similar/'}
      ]);

      expect(trigger).toBeCalled();
      let calls = trigger.mock.calls;
      let arg = calls[calls.length - 1][0];

      expect(arg.filteredSimilarItems.length).toBe(1);
      expect(arg.similarItems.length).toBe(2);
      expect(arg).toMatchObject({
        loading: false,
        error: false,
        mergeState: new Map(),
        mergedItems: [],
        similarItems: [
          {
            isBelowThreshold: false,
            issue: {
              id: '274'
            }
          },
          {
            isBelowThreshold: false,
            issue: {
              id: '275'
            }
          }
        ],
        filteredSimilarItems: [
          {
            isBelowThreshold: true,
            issue: {
              id: '216'
            }
          }
        ],
        unmergeState: new Map()
      });
    });

    it('unsuccessfully fetches list of similar items', function() {
      Client.clearMockResponses();
      Client.addMockResponse({
        url: '/issues/groupId/similar/',
        statusCode: 500,
        body: {message: 'failed'}
      });

      let promise = GroupingStore.onFetch([
        {dataKey: 'similar', endpoint: '/issues/groupId/similar/'}
      ]);

      expect(trigger).toBeCalled();
      let calls = trigger.mock.calls;
      return promise.then(() => {
        let arg = calls[calls.length - 1][0];
        expect(arg).toMatchObject({
          loading: false,
          error: true,
          mergeState: new Map(),
          mergedItems: [],
          unmergeState: new Map()
        });
      });
    });

    it('fetches list of hashes', function() {
      let promise = GroupingStore.onFetch([
        {dataKey: 'merged', endpoint: '/issues/groupId/hashes/'}
      ]);

      expect(trigger).toBeCalled();
      let calls = trigger.mock.calls;
      return promise.then(() => {
        let arg = calls[calls.length - 1][0];
        expect(arg.mergedItems.length).toBe(5);
        expect(arg).toMatchObject({
          loading: false,
          error: false,
          similarItems: [],
          filteredSimilarItems: [],
          mergeState: new Map(),
          unmergeState: new Map([
            ['1', {busy: true}],
            ['2', {busy: false}],
            ['3', {busy: false}],
            ['4', {busy: false}],
            ['5', {busy: true}]
          ])
        });
      });
    });

    it('unsuccessfully fetches list of hashes items', function() {
      Client.clearMockResponses();
      Client.addMockResponse({
        url: '/issues/groupId/hashes/',
        statusCode: 500,
        body: {message: 'failed'}
      });

      let promise = GroupingStore.onFetch([
        {dataKey: 'merged', endpoint: '/issues/groupId/hashes/'}
      ]);

      expect(trigger).toBeCalled();
      let calls = trigger.mock.calls;
      return promise.then(() => {
        let arg = calls[calls.length - 1][0];
        expect(arg).toMatchObject({
          loading: false,
          error: true,
          mergeState: new Map(),
          mergedItems: [],
          unmergeState: new Map()
        });
      });
    });
  });

  describe('Similar Issues list (to be merged)', function() {
    let mergeList;
    let mergeState;

    beforeEach(function() {
      mergeList = new Set();
      mergeState = new Map();
      return GroupingStore.onFetch([
        {dataKey: 'similar', endpoint: '/issues/groupId/similar/'}
      ]);
    });

    describe('onToggleMerge (checkbox state)', function() {
      // Attempt to check first item but its "locked" so should not be able to do anything
      it('can check and uncheck item', function() {
        GroupingStore.onToggleMerge('1');

        mergeList.add('1');
        mergeState.set('1', {checked: true});
        expect(GroupingStore.mergeList).toEqual(mergeList);
        expect(GroupingStore.mergeState).toEqual(mergeState);

        // Uncheck
        GroupingStore.onToggleMerge('1');
        mergeList.delete('1');
        mergeState.set('1', {checked: false});

        // Check all
        GroupingStore.onToggleMerge('1');
        GroupingStore.onToggleMerge('2');
        GroupingStore.onToggleMerge('3');

        mergeList.add('1');
        mergeList.add('2');
        mergeList.add('3');
        mergeState.set('1', {checked: true});
        mergeState.set('2', {checked: true});
        mergeState.set('3', {checked: true});

        expect(GroupingStore.mergeList).toEqual(mergeList);
        expect(GroupingStore.mergeState).toEqual(mergeState);

        expect(trigger).toHaveBeenLastCalledWith({
          mergeDisabled: false,
          mergeList,
          mergeState
        });
      });
    });

    describe('onMerge', function() {
      beforeEach(function() {
        jest.spyOn(Client.prototype, 'merge');
        Client.clearMockResponses();
        Client.addMockResponse({
          method: 'PUT',
          url: '/projects/orgId/projectId/issues/'
        });
      });
      afterEach(function() {});

      it('disables rows to be merged', async function() {
        GroupingStore.onToggleMerge('1');
        let promise = GroupingStore.onMerge({
          params: {
            orgId: 'orgId',
            projectId: 'projectId',
            groupId: 'groupId'
          }
        });

        mergeList.add('1');
        mergeState.set('1', {checked: true, busy: false});

        expect(trigger).toHaveBeenCalledWith({
          mergeDisabled: true,
          mergeList,
          mergeState
        });

        await promise;

        expect(Client.prototype.merge).toHaveBeenCalledWith(
          {
            orgId: 'orgId',
            projectId: 'projectId',
            itemIds: ['1', 'groupId'],
            query: undefined
          },
          {
            error: expect.any(Function),
            success: expect.any(Function),
            complete: expect.any(Function)
          }
        );

        expect(trigger).toHaveBeenLastCalledWith({
          mergeDisabled: false,
          mergeList,
          mergeState
        });
      });

      it('keeps rows in "busy" state and unchecks after successfully adding to merge queue', async function() {
        GroupingStore.onToggleMerge('1');
        mergeList.add('1');
        mergeState.set('1', {checked: true, busy: false});

        let promise = GroupingStore.onMerge({
          params: {
            orgId: 'orgId',
            projectId: 'projectId',
            groupId: 'groupId'
          }
        });

        expect(trigger).toHaveBeenCalledWith({
          mergeDisabled: true,
          mergeList,
          mergeState
        });

        await promise;

        expect(trigger).toHaveBeenLastCalledWith({
          mergeDisabled: false,
          mergeList: new Set(),
          mergeState
        });
      });

      it('resets busy state and has same items checked after error when trying to merge', async function() {
        Client.clearMockResponses();
        Client.addMockResponse({
          method: 'PUT',
          url: '/projects/orgId/projectId/issues/',
          statusCode: 500,
          body: {}
        });

        GroupingStore.onToggleMerge('1');
        mergeList.add('1');
        mergeState.set('1', {checked: true, busy: false});

        let promise = GroupingStore.onMerge({
          params: {
            orgId: 'orgId',
            projectId: 'projectId',
            groupId: 'groupId'
          }
        });

        expect(trigger).toHaveBeenCalledWith({
          mergeDisabled: true,
          mergeList,
          mergeState
        });

        await promise;

        expect(trigger).toHaveBeenLastCalledWith({
          mergeDisabled: false,
          mergeList,
          mergeState
        });
      });
    });
  });

  describe('Hashes list (to be unmerged)', function() {
    let unmergeList;
    let unmergeState;

    beforeEach(async function() {
      unmergeList = new Set();
      unmergeState = new Map();
      await GroupingStore.onFetch([
        {dataKey: 'merged', endpoint: '/issues/groupId/hashes/'}
      ]);

      trigger.mockClear();
      unmergeState = new Map([...GroupingStore.unmergeState]);
    });

    describe('onToggleUnmerge (checkbox state for hashes)', function() {
      // Attempt to check first item but its "locked" so should not be able to do anything
      it('can not check locked item', function() {
        GroupingStore.onToggleUnmerge('1');

        expect(GroupingStore.unmergeList).toEqual(unmergeList);
        expect(GroupingStore.unmergeState).toEqual(unmergeState);
        expect(trigger).not.toHaveBeenCalled();
      });

      it('can check and uncheck unlocked items', function() {
        // Check
        GroupingStore.onToggleUnmerge('2');
        unmergeList.add('2');
        unmergeState.set('2', {busy: false, checked: true});

        expect(GroupingStore.unmergeList).toEqual(unmergeList);
        expect(GroupingStore.unmergeState).toEqual(unmergeState);

        // Uncheck
        GroupingStore.onToggleUnmerge('2');
        unmergeList.delete('2');
        unmergeState.set('2', {busy: false, checked: false});

        expect(GroupingStore.unmergeList).toEqual(unmergeList);
        expect(GroupingStore.unmergeState).toEqual(unmergeState);

        // Check
        GroupingStore.onToggleUnmerge('2');
        unmergeList.add('2');
        unmergeState.set('2', {busy: false, checked: true});

        expect(GroupingStore.unmergeList).toEqual(unmergeList);
        expect(GroupingStore.unmergeState).toEqual(unmergeState);

        expect(trigger).toHaveBeenLastCalledWith({
          unmergeDisabled: false,
          unmergeList,
          unmergeState
        });
      });

      it('selecting the second to last available checkbox should disable the remaining checkbox and re-enable when unchecking', function() {
        GroupingStore.onToggleUnmerge('3');
        GroupingStore.onToggleUnmerge('4');
        unmergeList.add('3');
        unmergeList.add('4');
        unmergeState.set('3', {busy: false, checked: true});
        unmergeState.set('4', {busy: false, checked: true});
        unmergeState.set('2', {busy: false, disabled: true});

        expect(GroupingStore.remainingItem).toMatchObject({
          id: '2'
        });
        expect(GroupingStore.unmergeList).toEqual(unmergeList);
        expect(GroupingStore.unmergeState).toEqual(unmergeState);

        // Unchecking
        GroupingStore.onToggleUnmerge('4');
        unmergeList.delete('4');
        unmergeState.set('4', {busy: false, checked: false});
        unmergeState.set('2', {busy: false, disabled: false});

        expect(GroupingStore.remainingItem).toBe(null);
        expect(GroupingStore.unmergeList).toEqual(unmergeList);
        expect(GroupingStore.unmergeState).toEqual(unmergeState);

        expect(trigger).toHaveBeenLastCalledWith({
          unmergeDisabled: false,
          unmergeList,
          unmergeState
        });
      });
    });

    describe('onUnmerge', function() {
      beforeEach(function() {
        Client.clearMockResponses();
        Client.addMockResponse({
          method: 'DELETE',
          url: '/issues/groupId/hashes/'
        });
      });
      afterEach(function() {});

      it('disables rows to be merged', function() {
        GroupingStore.onToggleUnmerge('1');
        unmergeList.add('1');
        unmergeState.set('1', {checked: true, busy: false});

        trigger.mockClear();
        GroupingStore.onUnmerge({
          groupId: 'groupId'
        });

        expect(trigger).toHaveBeenCalledWith({
          unmergeDisabled: true,
          unmergeList,
          unmergeState
        });
      });

      it('keeps rows in "busy" state and unchecks after successfully adding to merge queue', async function() {
        GroupingStore.onToggleUnmerge('1');
        unmergeList.add('1');
        unmergeState.set('1', {checked: true, busy: false});

        let promise = GroupingStore.onUnmerge({
          groupId: 'groupId'
        });

        expect(trigger).toHaveBeenCalledWith({
          unmergeDisabled: true,
          unmergeList,
          unmergeState
        });

        await promise;

        expect(trigger).toHaveBeenLastCalledWith({
          unmergeDisabled: false,
          unmergeList: new Set(),
          unmergeState
        });
      });

      it('resets busy state and has same items checked after error when trying to merge', async function() {
        Client.clearMockResponses();
        Client.addMockResponse({
          method: 'DELETE',
          url: '/issues/groupId/hashes/',
          statusCode: 500,
          body: {}
        });

        GroupingStore.onToggleUnmerge('2');
        unmergeList.add('1');
        unmergeState.set('1', {checked: true, busy: false});

        let promise = GroupingStore.onUnmerge({
          groupId: 'groupId'
        });

        expect(trigger).toHaveBeenCalledWith({
          unmergeDisabled: true,
          unmergeList,
          unmergeState
        });

        await promise;

        expect(trigger).toHaveBeenLastCalledWith({
          unmergeDisabled: false,
          unmergeList,
          unmergeState
        });
      });
    });
  });
});
