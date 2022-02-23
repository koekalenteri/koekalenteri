import { Event } from "koekalenteri-shared/model";
import { useTranslation } from "react-i18next";

export function CostInfo({ event }: { event: Event }) {
  const { t } = useTranslation('event');

  return (
    <>
      {t('cost')}: {event.cost} €<br />
      {t('costMember')}: {event.costMember} €<br />
      {t('accountNumber')}: {event.accountNumber}<br />
      {t('referenceNumber')}: {event.referenceNumber}<br />
      {event.paymentDetails}
    </>
  );
}
