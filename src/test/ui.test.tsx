import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';

describe('UI Components', () => {
  describe('Button', () => {
    it('should render children', () => {
      render(<Button>Click me</Button>);
      expect(screen.getByText('Click me')).toBeInTheDocument();
    });

    it('should handle click', () => {
      const onClick = vi.fn();
      render(<Button onClick={onClick}>Click me</Button>);
      fireEvent.click(screen.getByText('Click me'));
      expect(onClick).toHaveBeenCalled();
    });

    it('should be disabled', () => {
      render(<Button disabled>Click me</Button>);
      expect(screen.getByText('Click me')).toBeDisabled();
    });
  });

  describe('Input', () => {
    it('should render with label', () => {
      render(<Input label="Test Label" />);
      expect(screen.getByText('Test Label')).toBeInTheDocument();
    });

    it('should show error', () => {
      render(<Input error="Error message" />);
      expect(screen.getByText('Error message')).toBeInTheDocument();
    });
  });

  describe('Modal', () => {
    it('should render when open', () => {
      render(
        <Modal isOpen={true} onClose={() => {}} title="Test Modal">
          <p>Modal content</p>
        </Modal>
      );
      expect(screen.getByText('Test Modal')).toBeInTheDocument();
      expect(screen.getByText('Modal content')).toBeInTheDocument();
    });

    it('should not render when closed', () => {
      render(
        <Modal isOpen={false} onClose={() => {}} title="Test Modal">
          <p>Modal content</p>
        </Modal>
      );
      expect(screen.queryByText('Test Modal')).not.toBeInTheDocument();
    });
  });

  describe('Badge', () => {
    it('should render children', () => {
      render(<Badge>Test Badge</Badge>);
      expect(screen.getByText('Test Badge')).toBeInTheDocument();
    });
  });
});
