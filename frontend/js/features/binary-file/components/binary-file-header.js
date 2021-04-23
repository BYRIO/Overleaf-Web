import React, { useState, useEffect, useRef, useCallback } from 'react'
import PropTypes from 'prop-types'
import Icon from '../../../shared/components/icon'
import { formatTime, relativeDate } from '../../utils/format-date'
import { Trans, useTranslation } from 'react-i18next'
import importOverleafModules from '../../../../macros/import-overleaf-module.macro'
import { postJSON } from '../../../infrastructure/fetch-json'

const tprLinkedFileInfo = importOverleafModules('tprLinkedFileInfo')
const tprLinkedFileRefreshError = importOverleafModules(
  'tprLinkedFileRefreshError'
)

const MAX_URL_LENGTH = 60
const FRONT_OF_URL_LENGTH = 35
const FILLER = '...'
const TAIL_OF_URL_LENGTH = MAX_URL_LENGTH - FRONT_OF_URL_LENGTH - FILLER.length

function shortenedUrl(url) {
  if (!url) {
    return
  }
  if (url.length > MAX_URL_LENGTH) {
    const front = url.slice(0, FRONT_OF_URL_LENGTH)
    const tail = url.slice(url.length - TAIL_OF_URL_LENGTH)
    return front + FILLER + tail
  }
  return url
}

export default function BinaryFileHeader({ file, storeReferencesKeys }) {
  const isMounted = useRef(true)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState(null)
  const { t } = useTranslation()

  useEffect(() => {
    // set to false on unmount to avoid unmounted component warning when refreshing
    return () => (isMounted.current = false)
  }, [])

  let fileInfo
  if (file.linkedFileData) {
    if (file.linkedFileData.provider === 'url') {
      fileInfo = (
        <div>
          <UrlProvider file={file} />
        </div>
      )
    } else if (file.linkedFileData.provider === 'project_file') {
      fileInfo = (
        <div>
          <ProjectFilePathProvider file={file} />
        </div>
      )
    } else if (file.linkedFileData.provider === 'project_output_file') {
      fileInfo = (
        <div>
          <ProjectOutputFileProvider file={file} />
        </div>
      )
    }
  }

  const refreshFile = useCallback(() => {
    setRefreshing(true)
    // Replacement of the file handled by the file tree
    window.expectingLinkedFileRefreshedSocketFor = file.name
    postJSON(`/project/${window.project_id}/linked_file/${file.id}/refresh`, {
      disableAutoLoginRedirect: true
    })
      .then(() => {
        if (isMounted.current) {
          setRefreshing(false)
        }
      })
      .catch(err => {
        if (isMounted.current) {
          setRefreshing(false)
          setRefreshError(err.message)
        }
      })
      .finally(() => {
        if (
          file.linkedFileData.provider === 'mendeley' ||
          file.linkedFileData.provider === 'zotero' ||
          file.name.match(/^.*\.bib$/)
        ) {
          reindexReferences()
        }
      })

    function reindexReferences() {
      const opts = {
        body: { shouldBroadcast: true }
      }

      postJSON(`/project/${window.project_id}/references/indexAll`, opts)
        .then(response => {
          // Later updated by the socket but also updated here for immediate use
          storeReferencesKeys(response.keys)
        })
        .catch(error => {
          console.log(error)
        })
    }
  }, [file, isMounted, storeReferencesKeys])

  return (
    <div className="binary-file-header">
      {file.linkedFileData && fileInfo}
      {file.linkedFileData &&
        tprLinkedFileInfo.map(({ import: { LinkedFileInfo }, path }) => (
          <LinkedFileInfo key={path} file={file} />
        ))}
      {file.linkedFileData && (
        <button
          className="btn btn-success"
          onClick={refreshFile}
          disabled={refreshing}
        >
          <Icon type="refresh" spin={refreshing} modifier="fw" />
          <span>{refreshing ? t('refreshing') + '...' : t('refresh')}</span>
        </button>
      )}
      &nbsp;
      <a
        href={`/project/${window.project_id}/file/${file.id}`}
        className="btn btn-info"
      >
        <Icon type="download" modifier="fw" />
        <span>{' ' + t('download')}</span>
      </a>
      {refreshError && (
        <div className="row">
          <br />
          <div className="alert alert-danger col-md-6 col-md-offset-3">
            Error: {refreshError}
            {tprLinkedFileRefreshError.map(
              ({ import: { LinkedFileRefreshError }, path }) => (
                <LinkedFileRefreshError key={path} file={file} />
              )
            )}
          </div>
        </div>
      )}
    </div>
  )
}

BinaryFileHeader.propTypes = {
  file: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
    linkedFileData: PropTypes.object
  }).isRequired,
  storeReferencesKeys: PropTypes.func.isRequired
}

function UrlProvider({ file }) {
  return (
    <p>
      <Icon
        type="external-link-square"
        modifier="rotate-180"
        classes={{ icon: 'linked-file-icon' }}
      />
      &nbsp;
      <Trans
        i18nKey="imported_from_external_provider_at_date"
        components={
          /* eslint-disable-next-line jsx-a11y/anchor-has-content, react/jsx-key */
          [<a href={file.linkedFileData.url} />]
        }
        values={{
          shortenedUrl: shortenedUrl(file.linkedFileData.url),
          formattedDate: formatTime(file.created),
          relativeDate: relativeDate(file.created)
        }}
      />
    </p>
  )
}

UrlProvider.propTypes = {
  file: PropTypes.shape({
    linkedFileData: PropTypes.object,
    created: PropTypes.string
  }).isRequired
}

function ProjectFilePathProvider({ file }) {
  /* eslint-disable jsx-a11y/anchor-has-content, react/jsx-key */
  return (
    <p>
      <Icon
        type="external-link-square"
        modifier="rotate-180"
        classes={{ icon: 'linked-file-icon' }}
      />
      &nbsp;
      <Trans
        i18nKey="imported_from_another_project_at_date"
        components={
          file.linkedFileData.v1_source_doc_id
            ? [<span />]
            : [
                <a
                  href={`/project/${file.linkedFileData.source_project_id}`}
                  target="_blank"
                />
              ]
        }
        values={{
          sourceEntityPath: file.linkedFileData.source_entity_path.slice(1),
          formattedDate: formatTime(file.created),
          relativeDate: relativeDate(file.created)
        }}
      />
    </p>
    /* esline-enable jsx-a11y/anchor-has-content, react/jsx-key */
  )
}

ProjectFilePathProvider.propTypes = {
  file: PropTypes.shape({
    linkedFileData: PropTypes.object,
    created: PropTypes.string
  }).isRequired
}

function ProjectOutputFileProvider({ file }) {
  return (
    <p>
      <Icon
        type="external-link-square"
        modifier="rotate-180"
        classes={{ icon: 'linked-file-icon' }}
      />
      &nbsp;
      <Trans
        i18nKey="imported_from_the_output_of_another_project_at_date"
        components={
          file.linkedFileData.v1_source_doc_id
            ? [<span />]
            : [
                <a
                  href={`/project/${file.linkedFileData.source_project_id}`}
                  target="_blank"
                />
              ]
        }
        values={{
          sourceOutputFilePath: file.linkedFileData.source_output_file_path,
          formattedDate: formatTime(file.created),
          relativeDate: relativeDate(file.created)
        }}
      />
    </p>
  )
}

ProjectOutputFileProvider.propTypes = {
  file: PropTypes.shape({
    linkedFileData: PropTypes.object,
    created: PropTypes.string
  }).isRequired
}