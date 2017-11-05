package shengji.gui;

import java.awt.event.MouseEvent;
import java.awt.event.MouseListener;

public class CardContainer extends ImageContainer {

    private boolean isSelected = false;

    private static final boolean SELECTED = true;
    private static final boolean NOT_SELECTED = false;

    private static final int MOVE_DISTANCE = 20;

    public CardContainer(String filenameInImages) {
        super(filenameInImages);

        this.addMouseListener(new MouseListener() {
            public void mouseClicked(MouseEvent e) {
                if (isSelected) {
                    MoveVertical(MOVE_DISTANCE);
                }
                else {
                    MoveVertical(-MOVE_DISTANCE);
                }

                isSelected = !isSelected;
            }

            public void mousePressed(MouseEvent e) { }
            public void mouseReleased(MouseEvent e) { }
            public void mouseEntered(MouseEvent e) { }
            public void mouseExited(MouseEvent e) { }
        });
    }

    private void MoveVertical(int distance) {
        int oldX = this.getX();
        int oldY = this.getY();
        super.setLocation(oldX, oldY + distance);
    }

}
