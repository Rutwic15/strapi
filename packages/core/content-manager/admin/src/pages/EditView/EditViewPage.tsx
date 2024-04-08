import * as React from 'react';

import {
  Page,
  Blocker,
  Form,
  FormHelpers,
  useNotification,
  useQueryParams,
} from '@strapi/admin/strapi-admin';
import {
  Grid,
  GridItem,
  Main,
  SetSelectedTabIndexHandler,
  Tab,
  TabGroup,
  TabPanel,
  TabPanels,
  Tabs,
} from '@strapi/design-system';
import { useIntl } from 'react-intl';
import { useLocation, useParams } from 'react-router-dom';
import styled from 'styled-components';

import { SINGLE_TYPES } from '../../constants/collections';
import { DocumentRBAC, useDocumentRBAC } from '../../features/DocumentRBAC';
import { type UseDocument, useDoc } from '../../hooks/useDocument';
import { useDocumentLayout } from '../../hooks/useDocumentLayout';
import { useLazyComponents } from '../../hooks/useLazyComponents';
import { useOnce } from '../../hooks/useOnce';
import { useSyncRbac } from '../../hooks/useSyncRbac';
import { getTranslation } from '../../utils/translations';
import { createYupSchema } from '../../utils/validation';

import { FormLayout } from './components/FormLayout';
import { Header } from './components/Header';
import { Panels } from './components/Panels';
import { transformDocument } from './utils/data';
import { createDefaultForm } from './utils/forms';

/* -------------------------------------------------------------------------------------------------
 * EditViewPage
 * -----------------------------------------------------------------------------------------------*/

const EditViewPage = () => {
  const location = useLocation();
  const [
    {
      query: { status },
    },
    setQuery,
  ] = useQueryParams<{ status: 'draft' | 'published' }>();
  const { formatMessage } = useIntl();
  const { toggleNotification } = useNotification();
  const tabApi = React.useRef<{
    _handlers: {
      setSelectedTabIndex: SetSelectedTabIndexHandler;
    };
  }>(null);

  const {
    document,
    meta,
    isLoading: isLoadingDocument,
    schema,
    components,
    collectionType,
    id,
    model,
  } = useDoc();

  const hasDraftAndPublished = schema?.options?.draftAndPublish ?? false;

  useOnce(() => {
    /**
     * We only ever want to fire the notification once otherwise
     * whenever the app re-renders it'll pop up regardless of
     * what we do because the state comes from react-router-dom
     */
    if (location?.state && 'error' in location.state) {
      toggleNotification({
        type: 'danger',
        message: location.state.error,
        timeout: 5000,
      });
    }
  });

  const isLoadingActionsRBAC = useDocumentRBAC('EditViewPage', (state) => state.isLoading);

  const isSingleType = collectionType === SINGLE_TYPES;

  /**
   * single-types don't current have an id, but because they're a singleton
   * we can simply use the update operation to continuously update the same
   * document with varying params.
   */
  const isCreatingDocument = !id && !isSingleType;

  const {
    isLoading: isLoadingLayout,
    edit: {
      layout,
      settings: { mainField },
    },
  } = useDocumentLayout(model);

  const { isLazyLoading } = useLazyComponents([]);

  const isLoading = isLoadingActionsRBAC || isLoadingDocument || isLoadingLayout || isLazyLoading;

  /**
   * Here we prepare the form for editing, we need to:
   * - remove prohibited fields from the document (passwords | ADD YOURS WHEN THERES A NEW ONE)
   * - swap out count objects on relations for empty arrays
   * - set __temp_key__ on array objects for drag & drop
   *
   * We also prepare the form for new documents, so we need to:
   * - set default values on fields
   */
  const initialValues = React.useMemo(() => {
    if ((!document && !isCreatingDocument && !isSingleType) || !schema) {
      return undefined;
    }

    /**
     * Check that we have an ID so we know the
     * document has been created in some way.
     */
    const form = document?.id ? document : createDefaultForm(schema, components);

    return transformDocument(schema, components)(form);
  }, [document, isCreatingDocument, isSingleType, schema, components]);

  if (isLoading && !document?.documentId) {
    return <Page.Loading />;
  }

  if (!initialValues) {
    return <Page.Error />;
  }

  const handleTabChange = (index: number) => {
    if (index === 0) {
      setQuery({ status: 'draft' }, 'push', true);
    } else {
      setQuery({ status: 'published' }, 'push', true);
    }
  };

  /**
   * We look to see what the mainField is from the configuration,
   * if it's an id we don't use it because it's a uuid format and
   * not very user friendly. Instead in that case, we simply write "Untitled".
   */
  const documentTitle =
    mainField !== 'id' && document?.[mainField] ? document[mainField] : 'Untitled';

  return (
    <Main paddingLeft={10} paddingRight={10}>
      <Page.Title>{`${documentTitle}`}</Page.Title>
      <Form
        disabled={hasDraftAndPublished && status === 'published'}
        initialValues={initialValues}
        method={isCreatingDocument ? 'POST' : 'PUT'}
        validationSchema={createYupSchema(schema?.attributes, components)}
      >
        {({ resetForm }) => (
          <>
            <Header
              isCreating={isCreatingDocument}
              status={hasDraftAndPublished ? getDocumentStatus(document, meta) : undefined}
              title={documentTitle}
            />
            <TabGroup
              ref={tabApi}
              variant="simple"
              label={formatMessage({
                id: getTranslation('containers.edit.tabs.label'),
                defaultMessage: 'Document status',
              })}
              selectedTabIndex={hasDraftAndPublished && status === 'published' ? 1 : 0}
              onTabChange={(index) => {
                // TODO: remove this hack when the tabs in the DS are implemented well and we can actually use callbacks.
                handleTabChange(index);
              }}
            >
              {hasDraftAndPublished ? (
                <Tabs>
                  <StatusTab>
                    {formatMessage({
                      id: getTranslation('containers.edit.tabs.draft'),
                      defaultMessage: 'draft',
                    })}
                  </StatusTab>
                  <StatusTab disabled={!meta || meta.availableStatus.length === 0}>
                    {formatMessage({
                      id: getTranslation('containers.edit.tabs.published'),
                      defaultMessage: 'published',
                    })}
                  </StatusTab>
                </Tabs>
              ) : null}
              <Grid paddingTop={8} gap={4}>
                <GridItem col={9} s={12}>
                  <TabPanels>
                    <TabPanel>
                      <FormLayout layout={layout} />
                    </TabPanel>
                    <TabPanel>
                      <FormLayout layout={layout} />
                    </TabPanel>
                  </TabPanels>
                </GridItem>
                <GridItem col={3} s={12}>
                  <Panels />
                </GridItem>
              </Grid>
            </TabGroup>
            <Blocker
              // We reset the form to the published version to avoid errors like – https://strapi-inc.atlassian.net/browse/CONTENT-2284
              onProceed={resetForm}
            />
          </>
        )}
      </Form>
    </Main>
  );
};

const StatusTab = styled(Tab)`
  text-transform: uppercase;
`;

/**
 * @internal
 * @description Returns the status of the document where it's latest state takes priority,
 * this typically will be "published" unless a user has edited their draft in which we should
 * display "modified".
 */
const getDocumentStatus = (
  document: ReturnType<UseDocument>['document'],
  meta: ReturnType<UseDocument>['meta']
): 'draft' | 'published' | 'modified' => {
  const docStatus = document?.status;
  const statuses = meta?.availableStatus ?? [];

  /**
   * Creating an entry
   */
  if (!docStatus) {
    return 'draft';
  }

  /**
   * We're viewing a draft, but the document could have a published version
   */
  if (docStatus === 'draft' && statuses.find((doc) => doc.publishedAt !== null)) {
    return 'published';
  }

  return docStatus;
};

/* -------------------------------------------------------------------------------------------------
 * ProtectedEditViewPage
 * -----------------------------------------------------------------------------------------------*/

const ProtectedEditViewPage = () => {
  const { slug } = useParams<{
    slug: string;
  }>();
  const [{ query }] = useQueryParams();
  const { permissions = [], isLoading, isError } = useSyncRbac(slug ?? '', query, 'editView');

  if (isLoading) {
    return <Page.Loading />;
  }

  if ((!isLoading && isError) || !slug) {
    return <Page.Error />;
  }

  return (
    <Page.Protect permissions={permissions}>
      {({ permissions }) => (
        <DocumentRBAC permissions={permissions}>
          <EditViewPage />
        </DocumentRBAC>
      )}
    </Page.Protect>
  );
};

export { EditViewPage, ProtectedEditViewPage };