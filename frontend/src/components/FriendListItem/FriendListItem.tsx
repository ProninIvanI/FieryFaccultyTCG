import styles from "./FriendListItem.module.css";

export type FriendListItemData = {
  id: string;
  name: string;
  status: string;
  subtitle?: string;
};

interface FriendListItemProps {
  friend: FriendListItemData;
}

export const FriendListItem = ({ friend }: FriendListItemProps) => {
  return (
    <div className={styles.row}>
      <div className={styles.avatar}>{friend.name.slice(0, 1)}</div>
      <div className={styles.info}>
        <div className={styles.name}>{friend.name}</div>
        <div className={styles.status}>{friend.status}</div>
        {friend.subtitle ? <div className={styles.subtitle}>{friend.subtitle}</div> : null}
      </div>
    </div>
  );
};
