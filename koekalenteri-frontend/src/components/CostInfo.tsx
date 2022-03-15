import { Event } from "koekalenteri-shared/model";
import { useTranslation } from "react-i18next";

export function CostInfo({ event }: { event: Event }) {
  const { t } = useTranslation();

  return (
    <>
      {t('event.cost')}: {event.cost} €<br />
      {t('event.costMember')}: {event.costMember} €<br />
      {t('event.accountNumber')}: {event.accountNumber}<br />
      {t('event.referenceNumber')}: {event.referenceNumber}<br />
      {event.paymentDetails}
    </>
  );
}
