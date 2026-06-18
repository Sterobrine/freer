from typing import Any, Dict, List, Optional

import paths
import Tools
from serialization import sanitize_action_dict, sanitize_event_dict


class EventStore:
    @staticmethod
    def list_events() -> List[Dict[str, Any]]:
        raw = Tools.FileTool.ReadJSON(str(paths.EVENT_JSON))
        return [sanitize_event_dict(item) for item in raw]

    @staticmethod
    def write_events(events: List[Dict[str, Any]]) -> None:
        from freer_api.validate import validate_event

        cleaned = [sanitize_event_dict(item) for item in events]
        index = {item['name']: item for item in cleaned if item.get('name')}
        for item in cleaned:
            result = validate_event(item, check_assets=False, index=index)
            if not result['valid']:
                name = item.get('name', '?')
                msgs = '；'.join(i['message'] for i in result['issues'])
                raise ValueError(f'事件 "{name}" 校验失败: {msgs}')
        Tools.FileTool.WriteJSON(str(paths.EVENT_JSON), cleaned, indent=2)

    @staticmethod
    def get_by_name(name: str) -> Optional[Dict[str, Any]]:
        for item in EventStore.list_events():
            if item.get('name') == name:
                return item
        return None

    @staticmethod
    def create(event: Dict[str, Any]) -> Dict[str, Any]:
        events = EventStore.list_events()
        if any(item.get('name') == event.get('name') for item in events):
            raise ValueError('事件名已存在')
        cleaned = sanitize_event_dict(event)
        events.append(cleaned)
        EventStore.write_events(events)
        return cleaned

    @staticmethod
    def update(name: str, event: Dict[str, Any]) -> Dict[str, Any]:
        events = EventStore.list_events()
        for i, item in enumerate(events):
            if item.get('name') == name:
                cleaned = sanitize_event_dict(event)
                cleaned['name'] = event.get('name', name)
                events[i] = cleaned
                EventStore.write_events(events)
                return cleaned
        raise KeyError(f'未找到事件: {name}')

    @staticmethod
    def delete(name: str) -> None:
        events = EventStore.list_events()
        new_events = [item for item in events if item.get('name') != name]
        if len(new_events) == len(events):
            raise KeyError(f'未找到事件: {name}')
        EventStore.write_events(new_events)


class ActionStore:
    @staticmethod
    def list_actions() -> List[Dict[str, Any]]:
        raw = Tools.FileTool.ReadJSON(str(paths.ACTION_JSON))
        return [sanitize_action_dict(item) for item in raw]

    @staticmethod
    def write_actions(actions: List[Dict[str, Any]]) -> None:
        cleaned = [sanitize_action_dict(item) for item in actions]
        Tools.FileTool.WriteJSON(str(paths.ACTION_JSON), cleaned, indent=2)

    @staticmethod
    def get_by_name(name: str) -> Optional[Dict[str, Any]]:
        for item in ActionStore.list_actions():
            if item.get('name') == name:
                return item
        return None

    @staticmethod
    def create(action: Dict[str, Any]) -> Dict[str, Any]:
        actions = ActionStore.list_actions()
        if any(item.get('name') == action.get('name') for item in actions):
            raise ValueError('动作名已存在')
        cleaned = sanitize_action_dict(action)
        actions.append(cleaned)
        ActionStore.write_actions(actions)
        return cleaned

    @staticmethod
    def update(name: str, action: Dict[str, Any]) -> Dict[str, Any]:
        actions = ActionStore.list_actions()
        for i, item in enumerate(actions):
            if item.get('name') == name:
                cleaned = sanitize_action_dict(action)
                cleaned['name'] = action.get('name', name)
                actions[i] = cleaned
                ActionStore.write_actions(actions)
                return cleaned
        raise KeyError(f'未找到动作: {name}')

    @staticmethod
    def delete(name: str) -> None:
        actions = ActionStore.list_actions()
        new_actions = [item for item in actions if item.get('name') != name]
        if len(new_actions) == len(actions):
            raise KeyError(f'未找到动作: {name}')
        ActionStore.write_actions(new_actions)
